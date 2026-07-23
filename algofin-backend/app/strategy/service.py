# app/strategy/service.py
# AlgoFin v2 — Phase M: StrategyService
#
# StrategyService is a Domain Service that owns the Strategy lifecycle.
#
# Architectural Principle 4 (Explicit State Transitions):
#   All Strategy state changes must pass through StrategyService.transition().
#   Direct assignment to strategy.status from routers is forbidden.
#
# State machine (from architecture doc):
#   DRAFT → ACTIVE (publish)
#   ACTIVE → PAUSED (pause)
#   ACTIVE → STOPPED (stop / max_executions reached)
#   ACTIVE → ARCHIVED (archive)
#   PAUSED → ACTIVE (resume)
#   PAUSED → ARCHIVED (archive)
#   STOPPED → ARCHIVED (archive)
#   DRAFT → ARCHIVED (archive/delete)
#   ARCHIVED → * (FORBIDDEN — terminal state)

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.strategy import Strategy

if TYPE_CHECKING:
    pass


# ── Allowed state transitions (Principle 4: Explicit State Transitions) ────────

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"active", "archived"},
    "active": {"paused", "stopped", "archived"},
    "paused": {"active", "archived"},
    "stopped": {"archived"},
    "archived": set(),  # terminal — no transitions out
}

# Human-readable trigger names for audit log
_TRANSITION_ACTIONS: dict[tuple[str, str], str] = {
    ("draft", "active"): "published",
    ("active", "paused"): "paused",
    ("active", "stopped"): "stopped",
    ("active", "archived"): "archived",
    ("paused", "active"): "resumed",
    ("paused", "archived"): "archived",
    ("stopped", "archived"): "archived",
    ("draft", "archived"): "archived",
}


class DomainError(Exception):
    """Raised when a domain invariant or state machine rule is violated."""

    pass


class StrategyService:
    """
    Owns the Strategy lifecycle.

    Enforces:
    - State machine transitions (Principle 4)
    - System-wide invariant: max 50 active strategies per user
    - System-wide invariant: ARCHIVED is permanent

    Does NOT own:
    - Signal processing (→ SignalService)
    - Secret lifecycle (→ SecretService)
    - Pine versioning (→ VersionService)
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── State Machine ─────────────────────────────────────────────────────────

    async def transition(
        self,
        strategy: Strategy,
        new_status: str,
        *,
        actor_id: uuid.UUID | None = None,
    ) -> str:
        """
        Validates and applies a status transition on a Strategy.

        Returns the audit action string (e.g. "published", "paused").
        Raises DomainError if the transition is not allowed.

        This is the ONLY method allowed to write strategy.status.
        All other code (routers, workers) must call this method.
        """
        current = strategy.status
        allowed = _ALLOWED_TRANSITIONS.get(current, set())

        if new_status not in allowed:
            if current == "archived":
                raise DomainError(
                    f"Strategy {strategy.id} is ARCHIVED (terminal state). "
                    "Create a new strategy instead."
                )
            raise DomainError(
                f"Invalid transition: {current!r} → {new_status!r}. "
                f"Allowed from {current!r}: {sorted(allowed) or 'none'}"
            )

        # Apply the transition
        strategy.status = new_status
        strategy.updated_at = datetime.now(timezone.utc)

        action = _TRANSITION_ACTIONS.get((current, new_status), "status_changed")
        return action

    # ── Creation ─────────────────────────────────────────────────────────────

    async def create_pine_webhook_strategy(
        self,
        user_id: uuid.UUID,
        exchange_account_id: uuid.UUID,
        name: str,
        symbol: str,
        timeframe: str | None = None,
        description: str | None = None,
    ) -> Strategy:
        """
        Creates a new pine_webhook strategy in DRAFT state.

        System-wide invariant: max_active_strategies_per_user is NOT checked
        at DRAFT creation — only checked on publish() when it goes ACTIVE.
        """
        strategy = Strategy(
            user_id=user_id,
            exchange_account_id=exchange_account_id,
            strategy_type="pine_webhook",
            status="draft",
            name=name,
            symbol=symbol.upper(),
            timeframe=timeframe,
            description=description,
            order_type="MARKET",
            is_test_mode=False,
            current_version=0,
            execution_count=0,
            reduce_only=False,
        )
        self._db.add(strategy)
        return strategy

    async def publish(
        self,
        strategy: Strategy,
        actor_id: uuid.UUID,
    ) -> str:
        """
        Publishes a DRAFT strategy to ACTIVE.

        Checks system-wide invariant: user must not exceed max_active_strategies.
        Returns audit action string.
        """
        if strategy.strategy_type != "pine_webhook":
            raise DomainError("publish() is only for pine_webhook strategies.")

        # System-wide invariant: max active strategies per user
        active_count = await self._count_active_pine_webhooks(strategy.user_id)
        if active_count >= settings.max_active_strategies_per_user:
            raise DomainError(
                f"Active strategy limit reached ({settings.max_active_strategies_per_user}). "
                "Pause or archive an existing strategy first."
            )

        return await self.transition(strategy, "active", actor_id=actor_id)

    # ── Updates ───────────────────────────────────────────────────────────────

    async def update_pine_code(
        self,
        strategy: Strategy,
        pine_code: str,
    ) -> None:
        """
        Updates the pine_code display field and bumps current_version.
        VersionService must be called separately to create the immutable snapshot.
        """
        strategy.pine_code = pine_code
        strategy.current_version += 1
        strategy.updated_at = datetime.now(timezone.utc)

    async def toggle_test_mode(self, strategy: Strategy, enabled: bool) -> None:
        """Enables or disables test mode. Allowed in any non-ARCHIVED state."""
        if strategy.status == "archived":
            raise DomainError("Cannot modify an archived strategy.")
        strategy.is_test_mode = enabled
        strategy.updated_at = datetime.now(timezone.utc)

    async def increment_execution_count(self, strategy: Strategy) -> bool:
        """
        Increments execution_count. If max_executions is reached, transitions to STOPPED.
        Returns True if strategy was auto-stopped, False otherwise.
        Called by ExecutionService after a successful order.
        """
        strategy.execution_count += 1
        strategy.last_executed_at = datetime.now(timezone.utc)

        if (
            strategy.max_executions
            and strategy.execution_count >= strategy.max_executions
        ):
            await self.transition(strategy, "stopped")
            return True
        return False

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _count_active_pine_webhooks(self, user_id: uuid.UUID) -> int:
        result = await self._db.execute(
            select(func.count()).where(
                Strategy.user_id == user_id,
                Strategy.strategy_type == "pine_webhook",
                Strategy.status == "active",
            )
        )
        return result.scalar_one()
