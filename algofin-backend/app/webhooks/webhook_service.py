# app/webhooks/webhook_service.py
# AlgoFin v2 — Phase M: WebhookService
#
# WebhookService is an Application Service that orchestrates the webhook receipt pipeline:
#
#   1. Content-Length check (before JSON parse — free)
#   2. IP allowlist check (in-memory — free)
#   3. Rate limit check (Redis INCR — ~10ms)
#   4. Strategy lookup (DB — ~50ms)
#   5. Status guard (strategy must be active)
#   6. Secret verification (bcrypt — ~80ms)  ← dominant cost
#   7. Replay detection (tv_timestamp age check — free)
#   8. Idempotency key computation (SHA-256 — free)
#   9. Redis dedup fast-path (SETNX — ~15ms)
#  10. DB INSERT signal + COMMIT (~50ms)
#  11. Redis LPUSH to queue (~15ms)
#  12. Return {"status": "accepted"}
#
# Total budget: < 200ms p95
#
# Architecture: WebhookService never imports TradingViewSignalSource directly.
# It receives SignalSourcePort via constructor injection.

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.ports.signal_source import SignalPayload, SignalSourcePort
from app.adapters.postgres_strategy_repo import PostgresStrategyRepository
from app.webhooks.secret_service import SecretService
from app.webhooks.signal_service import SignalService
from app.adapters.redis_queue import RedisQueueAdapter
from app.ports.queue import QueueMessage

logger = logging.getLogger(__name__)


class WebhookService:
    """
    Application Service: orchestrates webhook signal receipt.

    Injected dependencies (via constructor — testable without FastAPI):
    - db:              AsyncSession
    - redis:           Redis client (for rate limiting, dedup, queue)
    - signal_source:   SignalSourcePort (TradingViewSignalSource in production)
    """

    def __init__(
        self,
        db: AsyncSession,
        redis,
        signal_source: SignalSourcePort,
    ) -> None:
        self._db = db
        self._redis = redis
        self._source = signal_source
        self._strategy_repo = PostgresStrategyRepository(db)
        self._secret_svc = SecretService(db)
        self._signal_svc = SignalService(db, redis)
        self._queue = RedisQueueAdapter(redis)

    # ── Main entry point ─────────────────────────────────────────────────────

    async def receive(
        self,
        strategy_id: uuid.UUID,
        raw_payload: dict,
        sender_ip: str | None,
        is_test: bool = False,
    ) -> dict:
        """
        Processes an incoming webhook signal end-to-end.

        Returns a dict:
          {"status": "accepted",  "signal_id": "<uuid>"}  — normal
          {"status": "test_accepted", "signal_id": "<uuid>"} — test mode
          {"status": "invalid"}   — validation failure
          {"status": "duplicate"} — idempotency key already seen
          {"status": "invalid"}   — any other rejection (generic — no leakage)

        Always returns HTTP 200. Never raises.
        Architecture rule: TradingView must receive 200 or it will retry.
        """
        try:
            return await self._receive_inner(
                strategy_id=strategy_id,
                raw_payload=raw_payload,
                sender_ip=sender_ip,
                is_test=is_test,
            )
        except Exception as exc:
            logger.error(
                "WebhookService.receive() unhandled error",
                extra={
                    "strategy_id": str(strategy_id),
                    "sender_ip": sender_ip,
                    "error": str(exc),
                },
                exc_info=True,
            )
            return {"status": "invalid"}

    async def _receive_inner(
        self,
        strategy_id: uuid.UUID,
        raw_payload: dict,
        sender_ip: str | None,
        is_test: bool,
    ) -> dict:

        # ── Step 1: IP allowlist check (free — no I/O) ───────────────────────
        if sender_ip and not self._source.check_sender_ip(sender_ip):
            await self._track_brute_force(sender_ip)
            logger.warning(
                "Webhook rejected: IP not in allowlist",
                extra={"strategy_id": str(strategy_id), "sender_ip": sender_ip},
            )
            return {"status": "invalid"}

        # ── Step 2: Rate limit (Redis INCR) ──────────────────────────────────
        if self._redis and not await self._check_rate_limit(strategy_id):
            logger.warning(
                "Webhook rate limit exceeded",
                extra={"strategy_id": str(strategy_id)},
            )
            return {"status": "invalid"}

        # ── Step 3: Parse payload ─────────────────────────────────────────────
        try:
            signal_payload = self._source.parse_payload(raw_payload, strategy_id)
        except ValueError as exc:
            logger.warning(
                "Webhook payload validation failed",
                extra={"strategy_id": str(strategy_id), "error": str(exc)},
            )
            return {"status": "invalid"}

        # Inject sender_ip (not in raw payload)
        signal_payload = SignalPayload(
            **{**signal_payload.__dict__, "sender_ip": sender_ip, "is_test": is_test}
        )

        # ── Step 4: Strategy lookup (DB) ─────────────────────────────────────
        strategy = await self._strategy_repo.find_for_signal(strategy_id)
        if strategy is None:
            # Return generic "invalid" — do not reveal whether strategy exists
            return {"status": "invalid"}

        # ── Step 5: Status guard ─────────────────────────────────────────────
        if strategy.status not in ("active", "paused"):
            logger.info(
                "Webhook rejected: strategy not active",
                extra={"strategy_id": str(strategy_id), "status": strategy.status},
            )
            return {"status": "invalid"}

        # ── Step 6: Secret verification (bcrypt ~80ms) ───────────────────────
        plain_secret = str(raw_payload.get("secret", ""))
        verified = await self._secret_svc.verify(strategy_id, plain_secret)
        if not verified:
            await self._track_brute_force(sender_ip or str(strategy_id))
            logger.warning(
                "Webhook rejected: secret verification failed",
                extra={"strategy_id": str(strategy_id), "sender_ip": sender_ip},
            )
            return {"status": "invalid"}

        # ── Step 7: Replay detection ─────────────────────────────────────────
        if signal_payload.tv_timestamp:
            age = (
                datetime.now(timezone.utc) - signal_payload.tv_timestamp
            ).total_seconds()
            if age > settings.webhook_replay_window_seconds:
                logger.warning(
                    "Webhook rejected: signal too old (replay attack?)",
                    extra={
                        "strategy_id": str(strategy_id),
                        "age_seconds": age,
                        "tv_timestamp": signal_payload.tv_timestamp.isoformat(),
                    },
                )
                return {"status": "invalid"}

        # ── Step 8: Idempotency key ───────────────────────────────────────────
        idem_key = SignalService.compute_idempotency_key(
            strategy_id=strategy_id,
            action=signal_payload.action,
            ticker=signal_payload.ticker,
            contracts=signal_payload.contracts,
            tv_timestamp=signal_payload.tv_timestamp,
        )

        # ── Step 9: Redis dedup fast-path (SETNX) ────────────────────────────
        is_new = await self._signal_svc.check_and_reserve_dedup(idem_key)
        if not is_new:
            logger.info(
                "Webhook duplicate rejected (Redis fast-path)",
                extra={"strategy_id": str(strategy_id), "idempotency_key": idem_key},
            )
            return {"status": "duplicate"}

        # ── Step 10: DB INSERT signal ─────────────────────────────────────────
        try:
            signal = await self._signal_svc.persist_signal(
                payload=signal_payload,
                strategy=strategy,
                idempotency_key=idem_key,
                sender_ip=sender_ip,
            )
            await self._db.commit()
        except IntegrityError:
            # DB UNIQUE constraint fired — true duplicate (Redis missed it)
            await self._db.rollback()
            logger.info(
                "Webhook duplicate rejected (DB constraint)",
                extra={"strategy_id": str(strategy_id), "idempotency_key": idem_key},
            )
            return {"status": "duplicate"}
        except Exception as exc:
            await self._db.rollback()
            logger.error(
                "Webhook DB insert failed",
                extra={"strategy_id": str(strategy_id), "error": str(exc)},
                exc_info=True,
            )
            return {"status": "invalid"}

        # ── Step 11: Enqueue for worker (only for non-test, active signals) ───
        is_test_signal = (
            signal.is_test or strategy.is_test_mode or strategy.status == "paused"
        )
        if not is_test_signal:
            try:
                await self._queue.enqueue(
                    QueueMessage(
                        signal_id=signal.id,
                        strategy_id=strategy_id,
                    )
                )
            except Exception as exc:
                # Queue failure is non-fatal — reconciliation job will pick up
                # QUEUED signals that never get processed
                logger.error(
                    "Webhook enqueue failed — signal will be recovered by reconciliation",
                    extra={
                        "strategy_id": str(strategy_id),
                        "signal_id": str(signal.id),
                        "error": str(exc),
                    },
                )

        result_status = "test_accepted" if is_test_signal else "accepted"
        logger.info(
            "Webhook signal received",
            extra={
                "strategy_id": str(strategy_id),
                "signal_id": str(signal.id),
                "status": result_status,
                "action": signal_payload.action,
                "ticker": signal_payload.ticker,
            },
        )
        return {"status": result_status, "signal_id": str(signal.id)}

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _check_rate_limit(self, strategy_id: uuid.UUID) -> bool:
        """
        Sliding window rate limit: max 100 signals/min per strategy.
        Uses Redis INCR + EXPIRE (simple fixed window for now).
        Returns True if within limit, False if exceeded.
        """
        try:
            key = f"{settings.webhook_ratelimit_prefix}{strategy_id}"
            count = await self._redis.incr(key)
            if count == 1:
                await self._redis.expire(key, 60)  # Reset every 60 seconds
            return count <= settings.webhook_rate_limit
        except Exception:
            return True  # Redis unavailable: allow (fail open for availability)

    async def _track_brute_force(self, identifier: str) -> None:
        """
        Increments brute-force counter for an IP or strategy.
        After webhook_brute_force_limit (5) failures in 60s: blocks for 60s.
        Non-blocking — failure here is silently ignored.
        """
        try:
            key = f"{settings.webhook_brute_prefix}{identifier}"
            count = await self._redis.incr(key)
            if count == 1:
                await self._redis.expire(key, 60)
            if count >= settings.webhook_brute_force_limit:
                logger.warning(
                    "Brute-force threshold reached",
                    extra={"identifier": identifier, "count": count},
                )
        except Exception:
            pass
