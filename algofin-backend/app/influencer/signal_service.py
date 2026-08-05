# app/influencer/signal_service.py
# Phase INF: Signal ingestion — admin test path
#
# Two entry points:
#
#   send_test_signal(admin, data, db)
#     - Admin-only, always DRY_RUN
#     - Generates fresh UUID as idempotency_key per click (intentional)
#     - No IP check, no rate limit, no secret verification
#     - Inserts InfluencerSignal(is_test=True, execution_mode=DRY_RUN)
#     - Enqueues to algofin:inf_queue
#
#   receive(strategy_id, raw_payload, sender_ip, db, redis)
#     - TradingView webhook path (INF+1 / LIVE mode)
#     - Full validation: IP allowlist, rate limit, secret bcrypt verify,
#       action validation, replay detection, idempotency
#     - Inserts InfluencerSignal(is_test=False, execution_mode=LIVE)
#     - Enqueues to algofin:inf_queue
#     - Always returns within TradingView's 10s timeout window

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone

import bcrypt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.influencer.schemas import TestSignalRequest, TestSignalResponse
from app.models.influencer import InfluencerSignal, InfluencerStrategy

logger = logging.getLogger(__name__)

# Redis keys
_INF_QUEUE_KEY = "algofin:inf_queue"
_INF_RL_PREFIX = "algofin:inf_rl:"          # rate limit per strategy
_INF_DEDUP_PREFIX = "algofin:inf_dedup:"    # TV signal dedup

_VALID_ACTIONS = {"ENTER_LONG", "EXIT_LONG", "ENTER_SHORT", "EXIT_SHORT"}


# ── Admin: Test signal ────────────────────────────────────────────────────────


async def send_test_signal(
    data: TestSignalRequest,
    db: AsyncSession,
    redis,
) -> TestSignalResponse:
    """
    Admin-only: inject a test signal into the fan-out pipeline.

    Always DRY_RUN — no real orders placed.
    Each invocation generates a fresh UUID as idempotency_key, so repeated
    clicks never collide (supports iterative code-test-fix cycles).
    """
    strategy = await _load_active_strategy(db, data.influencer_strategy_id)

    signal = InfluencerSignal(
        influencer_strategy_id=strategy.id,
        action=data.action,
        ticker=data.ticker,
        price=data.price,
        tv_timestamp=None,
        idempotency_key=str(uuid.uuid4()),   # fresh per click
        sender_ip=None,
        raw_payload={
            "action": data.action,
            "ticker": data.ticker,
            "price": str(data.price) if data.price else None,
            "_source": "admin_test",
        },
        is_test=True,
        execution_mode="DRY_RUN",
        status="QUEUED",
        subscriber_count=0,
        received_at=datetime.now(timezone.utc),
    )
    db.add(signal)
    await db.commit()
    await db.refresh(signal)

    await _enqueue(redis, str(signal.id))

    logger.info(
        f"[Influencer] Test signal queued: {data.action} {data.ticker} "
        f"for {strategy.strategy_code} (signal_id={signal.id})"
    )
    return TestSignalResponse(
        signal_id=str(signal.id),
        status="QUEUED",
        message=f"Test signal queued for fan-out (DRY_RUN). signal_id={signal.id}",
    )


# ── TradingView: Real webhook (INF+1 path) ────────────────────────────────────


async def receive(
    strategy_id: str,
    raw_payload: dict,
    sender_ip: str | None,
    db: AsyncSession,
    redis,
) -> dict:
    """
    Receive and validate a real TradingView webhook signal.

    Always returns HTTP 200 to TradingView (avoid retries).
    All failures are logged and returned as {"status": "error"} — not raised.

    Security checks (in order):
    1. IP allowlist (TradingView CIDRs)
    2. Rate limit (100 signals/min per strategy via Redis)
    3. Strategy active check
    4. bcrypt secret verification
    5. Action validation
    6. Replay detection (tv_timestamp too old)
    7. Idempotency (Redis SETNX dedup, then DB UNIQUE constraint)
    """
    # 1. IP allowlist
    if sender_ip and sender_ip not in settings.tv_allowed_ips:
        logger.warning(f"[Influencer] Webhook from non-TV IP: {sender_ip}")
        return {"status": "rejected", "reason": "ip_not_allowed"}

    # 2. Rate limit
    rl_key = f"{_INF_RL_PREFIX}{strategy_id}"
    count = await redis.incr(rl_key)
    if count == 1:
        await redis.expire(rl_key, 60)
    if count > settings.webhook_rate_limit:
        logger.warning(f"[Influencer] Rate limit exceeded for strategy {strategy_id}")
        return {"status": "rejected", "reason": "rate_limit"}

    # 3. Load strategy (must be active)
    try:
        strategy = await _load_active_strategy(db, strategy_id)
    except ValueError as e:
        return {"status": "error", "reason": str(e)}

    # 4. Verify secret
    plain_secret = raw_payload.get("secret", "")
    if not strategy.webhook_secret_hash or not _verify_secret(
        plain_secret, strategy.webhook_secret_hash
    ):
        logger.warning(
            f"[Influencer] Invalid secret for strategy {strategy.strategy_code}"
        )
        return {"status": "rejected", "reason": "invalid_secret"}

    # 5. Action validation
    action = raw_payload.get("action", "")
    if action not in _VALID_ACTIONS:
        return {"status": "rejected", "reason": f"invalid_action: {action}"}

    ticker = str(raw_payload.get("ticker", "")).upper().strip()
    if not ticker:
        return {"status": "rejected", "reason": "missing_ticker"}

    # 6. Replay detection
    tv_timestamp = raw_payload.get("time") or raw_payload.get("timenow")
    tv_dt: datetime | None = None
    if tv_timestamp:
        try:
            tv_dt = datetime.fromisoformat(str(tv_timestamp).replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - tv_dt).total_seconds()
            if age > settings.webhook_replay_window_seconds:
                return {"status": "rejected", "reason": "replay_detected"}
        except Exception:
            tv_dt = None

    # 7. Idempotency key
    ts_unix = int(tv_dt.timestamp()) if tv_dt else 0
    raw_key = f"{strategy_id}:{action}:{ticker}:{ts_unix}"
    idem_key = hashlib.sha256(raw_key.encode()).hexdigest()

    # Redis SETNX dedup
    dedup_key = f"{_INF_DEDUP_PREFIX}{idem_key}"
    is_new = await redis.setnx(dedup_key, "1")
    if not is_new:
        return {"status": "duplicate"}
    await redis.expire(dedup_key, settings.webhook_dedup_ttl_seconds)

    # Insert signal
    price_raw = raw_payload.get("price") or raw_payload.get("close")
    try:
        from decimal import Decimal
        price = Decimal(str(price_raw)) if price_raw else None
    except Exception:
        price = None

    signal = InfluencerSignal(
        influencer_strategy_id=strategy.id,
        action=action,
        ticker=ticker,
        price=price,
        tv_timestamp=tv_dt,
        idempotency_key=idem_key,
        sender_ip=sender_ip,
        raw_payload=raw_payload,
        is_test=False,
        execution_mode="LIVE",
        status="QUEUED",
        subscriber_count=0,
        received_at=datetime.now(timezone.utc),
    )
    try:
        db.add(signal)
        await db.commit()
        await db.refresh(signal)
    except IntegrityError:
        await db.rollback()
        return {"status": "duplicate"}

    await _enqueue(redis, str(signal.id))

    return {"status": "queued", "signal_id": str(signal.id)}


# ── Internal helpers ──────────────────────────────────────────────────────────


async def _load_active_strategy(
    db: AsyncSession,
    strategy_id: str,
) -> InfluencerStrategy:
    try:
        sid = uuid.UUID(strategy_id)
    except ValueError:
        raise ValueError("Invalid strategy ID")

    result = await db.execute(
        select(InfluencerStrategy).where(
            InfluencerStrategy.id == sid,
            InfluencerStrategy.status == "active",
        )
    )
    strategy = result.scalar_one_or_none()
    if strategy is None:
        raise ValueError(f"Active strategy not found: {strategy_id}")
    return strategy


def _verify_secret(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


async def _enqueue(redis, signal_id: str) -> None:
    """Push signal_id to the influencer fan-out queue (FIFO)."""
    await redis.lpush(_INF_QUEUE_KEY, json.dumps({"signal_id": signal_id}))
