# app/webhooks/execution_service.py
# AlgoFin v2 — Phase M: ExecutionService
#
# ExecutionService is an Application Service that owns the decision:
# "what do we do with a dequeued signal?"
#
# Pipeline (per architecture doc):
#   1. Load signal read model (BC2 → BC3 crossing)
#   2. Load full strategy for execution context
#   3. SELECT strategy FOR UPDATE NOWAIT — concurrency lock
#   4. Guard: strategy still active?
#   5. Risk engine evaluation (in-memory, < 10ms)
#   6. If PASS: place Binance order via existing OrderService
#   7. Write ExecutionRecord (idempotent — UNIQUE signal_id)
#   8. Update signal status (via SignalService — sole writer)
#   9. Write outbox event for analytics fanout
#  10. Commit single transaction
#
# Concurrency: SELECT FOR UPDATE NOWAIT ensures only one worker
# processes any given strategy at a time (Architectural Principle 8).

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.strategy import Strategy, ExecutionRecord, DomainEventOutbox
from app.models.risk import RiskRule, RiskViolation
from app.orders.schemas import PlaceOrderRequest
from app.ports.repositories import SignalReadModel
from app.webhooks.signal_service import SignalService, SignalStatus

logger = logging.getLogger(__name__)


class ExecutionService:
    """
    Application service: decides what to do with a dequeued signal.

    Does NOT own:
    - Signal status writes (→ SignalService.update_status())
    - Strategy state transitions (→ StrategyService)
    - Secret lifecycle (→ SecretService)
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._signal_svc = SignalService(db)

    async def process_signal(self, signal_id: uuid.UUID, strategy_id: uuid.UUID) -> str:
        """
        Main entry point called by the worker loop.

        Returns terminal status string for logging:
          ORDER_SUBMITTED, RISK_BLOCKED, STRATEGY_PAUSED, FAILED, TIMEOUT
        Never raises — all exceptions are caught and result in FAILED status.
        """
        start_ms = int(time.time() * 1000)

        try:
            return await self._process_inner(signal_id, strategy_id, start_ms)
        except Exception as exc:
            duration_ms = int(time.time() * 1000) - start_ms
            logger.error(
                "ExecutionService unhandled error",
                extra={
                    "signal_id": str(signal_id),
                    "strategy_id": str(strategy_id),
                    "error": str(exc),
                    "duration_ms": duration_ms,
                },
                exc_info=True,
            )
            # Best-effort status update — may also fail if DB is down
            try:
                await self._signal_svc.update_status(
                    signal_id,
                    SignalStatus.FAILED,
                    error=f"Unhandled error: {type(exc).__name__}: {exc}",
                    processing_duration_ms=duration_ms,
                )
                await self._db.commit()
            except Exception:
                pass
            return SignalStatus.FAILED

    async def _process_inner(
        self,
        signal_id: uuid.UUID,
        strategy_id: uuid.UUID,
        start_ms: int,
    ) -> str:

        # ── Step 1: Mark signal PROCESSING (atomic read-then-write) ──────────
        await self._signal_svc.update_status(signal_id, SignalStatus.PROCESSING)
        await self._db.commit()

        # ── Step 2: Load signal read model (BC2 → BC3 boundary) ──────────────
        from app.adapters.postgres_signal_repo import PostgresSignalRepository
        signal_repo = PostgresSignalRepository(self._db)
        signal = await signal_repo.find_for_execution(signal_id)

        if signal is None:
            logger.warning(
                "Signal not found — may have been deleted (strategy archived mid-flight)",
                extra={"signal_id": str(signal_id)},
            )
            return SignalStatus.FAILED

        # ── Step 3: Load strategy WITH concurrency lock ───────────────────────
        # SELECT FOR UPDATE NOWAIT: if another worker has this strategy locked,
        # we immediately get LockNotAvailable — retry later (not deadlock).
        try:
            result = await self._db.execute(
                select(Strategy)
                .where(Strategy.id == strategy_id)
                .with_for_update(nowait=True)
            )
            strategy = result.scalar_one_or_none()
        except OperationalError as exc:
            # Lock not available — another worker is processing this strategy
            duration_ms = int(time.time() * 1000) - start_ms
            logger.info(
                "Strategy locked by another worker — will retry",
                extra={"strategy_id": str(strategy_id), "signal_id": str(signal_id)},
            )
            # Reset signal to QUEUED so it can be re-processed
            await self._db.rollback()
            return SignalStatus.QUEUED  # Worker will re-enqueue

        if strategy is None:
            await self._signal_svc.update_status(
                signal_id, SignalStatus.FAILED, error="Strategy not found"
            )
            await self._db.commit()
            return SignalStatus.FAILED

        # ── Step 4: Strategy status guard ─────────────────────────────────────
        if strategy.status == "paused":
            await self._signal_svc.update_status(signal_id, SignalStatus.STRATEGY_PAUSED)
            await self._db.commit()
            return SignalStatus.STRATEGY_PAUSED

        if strategy.status != "active":
            await self._signal_svc.update_status(
                signal_id, SignalStatus.FAILED,
                error=f"Strategy is {strategy.status!r}, not active",
            )
            await self._db.commit()
            return SignalStatus.FAILED

        # ── Step 5: Risk engine evaluation ────────────────────────────────────
        risk_result, risk_rule_id, risk_error = await self._evaluate_risk(
            signal=signal,
            strategy=strategy,
            user_id=signal.user_id,
        )

        # ── Step 6: If PASS — place order ─────────────────────────────────────
        order_id: uuid.UUID | None = None
        final_status = SignalStatus.FAILED

        if risk_result == "BLOCK":
            final_status = SignalStatus.RISK_BLOCKED
        else:
            # risk_result == "PASS"
            order_id, final_status = await self._place_order(signal, strategy)

        # ── Steps 7-9: Write ExecutionRecord + update signal + outbox ─────────
        duration_ms = int(time.time() * 1000) - start_ms

        exec_record = ExecutionRecord(
            signal_id=signal_id,
            strategy_id=strategy_id,
            user_id=signal.user_id,
            risk_result=risk_result,
            risk_rule_id=risk_rule_id,
            order_id=order_id,
            execution_latency_ms=duration_ms,
        )
        try:
            self._db.add(exec_record)
            await self._db.flush()
        except IntegrityError:
            # Duplicate signal_id — idempotent second delivery, safe to ignore
            await self._db.rollback()
            logger.info(
                "ExecutionRecord already exists — duplicate delivery handled",
                extra={"signal_id": str(signal_id)},
            )
            return final_status

        # Update signal status (only SignalService writes to strategy_signals.status)
        await self._signal_svc.update_status(
            signal_id,
            final_status,
            order_id=order_id,
            error=risk_error if risk_result == "BLOCK" else None,
            processing_duration_ms=duration_ms,
        )

        # Outbox event for analytics fanout
        event = DomainEventOutbox(
            event_type="ExecutionCompleted",
            payload={
                "signal_id": str(signal_id),
                "strategy_id": str(strategy_id),
                "user_id": str(signal.user_id),
                "risk_result": risk_result,
                "final_status": final_status,
                "order_id": str(order_id) if order_id else None,
                "execution_latency_ms": duration_ms,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            },
            status="pending",
        )
        self._db.add(event)

        # ── Step 10: Single commit ────────────────────────────────────────────
        await self._db.commit()

        logger.info(
            "Signal execution completed",
            extra={
                "signal_id": str(signal_id),
                "strategy_id": str(strategy_id),
                "risk_result": risk_result,
                "final_status": final_status,
                "duration_ms": duration_ms,
                "order_id": str(order_id) if order_id else None,
            },
        )
        return final_status

    # ── Risk evaluation ───────────────────────────────────────────────────────

    async def _evaluate_risk(
        self,
        signal: SignalReadModel,
        strategy: Strategy,
        user_id: uuid.UUID,
    ) -> tuple[str, uuid.UUID | None, str | None]:
        """
        Evaluates all active risk rules for the user against this order.
        Returns (risk_result, blocking_rule_id, error_message).
        risk_result: "PASS" | "BLOCK"
        """
        try:
            from app.risk.engine import evaluate_rules, RiskViolationError
            from app.orders.schemas import PlaceOrderRequest

            # Build a synthetic PlaceOrderRequest for the risk engine
            req = PlaceOrderRequest(
                exchange_account_id=signal.exchange_account_id,
                symbol=signal.ticker,
                side=signal.action.upper(),
                order_type="MARKET",
                quantity=signal.contracts or strategy.quantity or Decimal("0.001"),
                reduce_only=strategy.reduce_only,
            )

            # Get all exchange account IDs for daily PnL calculation
            from sqlalchemy import select as sa_select
            from app.models.exchange import UserExchangeAccount
            acct_result = await self._db.execute(
                sa_select(UserExchangeAccount.id).where(
                    UserExchangeAccount.user_id == user_id,
                    UserExchangeAccount.is_active == True,  # noqa: E712
                )
            )
            all_account_ids = [str(r) for r in acct_result.scalars().all()]

            from app.database import get_redis_client
            redis = await get_redis_client()

            await evaluate_rules(
                self._db,
                user_id=str(user_id),
                req=req,
                account_ids=all_account_ids,
                redis_client=redis,
            )
            return "PASS", None, None

        except Exception as exc:
            error_name = type(exc).__name__
            if "RiskViolationError" in error_name:
                rule = getattr(exc, "rule", None)
                rule_id = rule.id if rule else None
                return "BLOCK", rule_id, str(exc)
            # Unexpected risk engine error — fail safe (BLOCK)
            logger.error(
                "Risk engine error — blocking order as fail-safe",
                extra={"error": str(exc)},
                exc_info=True,
            )
            return "BLOCK", None, f"Risk engine error: {exc}"

    # ── Order placement ───────────────────────────────────────────────────────

    async def _place_order(
        self,
        signal: SignalReadModel,
        strategy: Strategy,
    ) -> tuple[uuid.UUID | None, str]:
        """
        Places a MARKET order via the existing OrderService.
        Returns (order_id, final_status).
        """
        try:
            from app.orders.service import place_order
            from app.orders.schemas import PlaceOrderRequest

            req = PlaceOrderRequest(
                exchange_account_id=signal.exchange_account_id,
                symbol=signal.ticker,
                side=signal.action.upper(),
                order_type="MARKET",
                quantity=signal.contracts or strategy.quantity or Decimal("0.001"),
                reduce_only=strategy.reduce_only,
            )
            order = await place_order(
                self._db,
                user_id=str(signal.user_id),
                req=req,
            )
            return order.id, SignalStatus.ORDER_SUBMITTED

        except Exception as exc:
            logger.error(
                "Order placement failed",
                extra={
                    "signal_id": str(signal.id),
                    "ticker": signal.ticker,
                    "action": signal.action,
                    "error": str(exc),
                },
                exc_info=True,
            )
            return None, SignalStatus.FAILED
