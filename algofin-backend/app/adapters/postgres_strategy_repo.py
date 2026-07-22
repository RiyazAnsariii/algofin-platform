# app/adapters/postgres_strategy_repo.py
# AlgoFin v2 — Phase M: PostgresStrategyRepository
#
# Implements StrategyRepository port using SQLAlchemy AsyncSession.
# This file contains ONLY DB queries — zero business logic.
# Business logic lives in StrategyService.

import uuid
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategy import Strategy
from app.ports.repositories import StrategyReadModel


class PostgresStrategyRepository:
    """
    PostgreSQL implementation of StrategyRepository.
    Injected via FastAPI dependency injection.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def find_for_signal(self, strategy_id: uuid.UUID) -> StrategyReadModel | None:
        """
        Fast lookup returning only fields needed for signal validation.
        Uses the strategies.id primary key index — O(log n).

        Called on EVERY webhook receipt. Budget: < 50ms.
        """
        result = await self._db.execute(
            select(
                Strategy.id,
                Strategy.user_id,
                Strategy.status,
                Strategy.is_test_mode,
                Strategy.current_version,
                Strategy.exchange_account_id,
                Strategy.strategy_type,
            ).where(Strategy.id == strategy_id)
        )
        row = result.one_or_none()
        if row is None:
            return None

        # Only return a model for pine_webhook strategies
        if row.strategy_type != "pine_webhook":
            return None

        return StrategyReadModel(
            id=row.id,
            user_id=row.user_id,
            status=row.status,
            is_test_mode=row.is_test_mode,
            current_version=row.current_version,
            exchange_account_id=row.exchange_account_id,
        )

    async def find_by_id(
        self,
        strategy_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Strategy | None:
        """
        Returns full Strategy ORM object for authorized user.
        Includes user_id check — enforces resource ownership.
        """
        result = await self._db.execute(
            select(Strategy).where(
                Strategy.id == strategy_id,
                Strategy.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_user(
        self,
        user_id: uuid.UUID,
        status_filter: str | None = None,
        strategy_type: str | None = None,
    ) -> list[Strategy]:
        """Returns all strategies for user, optionally filtered."""
        q = select(Strategy).where(Strategy.user_id == user_id)
        if status_filter:
            q = q.where(Strategy.status == status_filter)
        if strategy_type:
            q = q.where(Strategy.strategy_type == strategy_type)
        q = q.order_by(Strategy.created_at.desc())
        result = await self._db.execute(q)
        return list(result.scalars().all())

    async def save(self, strategy: Strategy) -> None:
        """
        Merges a strategy into the session. Caller manages transaction.
        For new strategies: use db.add() in StrategyService then call this.
        For updates: strategy is already tracked by the session.
        """
        self._db.add(strategy)

    async def count_active(self, user_id: uuid.UUID) -> int:
        """
        Counts active pine_webhook strategies for user.
        Used for max_active_strategies_per_user invariant check.
        """
        result = await self._db.execute(
            select(func.count()).where(
                Strategy.user_id == user_id,
                Strategy.strategy_type == "pine_webhook",
                Strategy.status == "active",
            )
        )
        return result.scalar_one()
