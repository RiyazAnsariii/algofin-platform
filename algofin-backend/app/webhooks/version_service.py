# app/webhooks/version_service.py
# AlgoFin v2 — Phase M: VersionService
#
# VersionService owns the immutable Pine Script version history.
#
# Architectural invariants enforced:
#   - Versions are APPEND-ONLY. No update or delete operations exist.
#   - Restoring a previous version creates a NEW version (not rollback).
#   - Strategy.current_version always matches the latest version_number.
#   - version_number is monotonically increasing per strategy.
#
# AlgoFin NEVER compiles, interprets, or executes Pine Script.
# Versions are documentation artifacts only — audit trail of what ran.

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategy import Strategy, StrategyPineVersion


class VersionService:
    """
    Owns the StrategyPineVersion immutable version history.

    Called by:
    - Strategy router when user saves new Pine code → save_version()
    - Strategy router when user wants version history → list_versions()
    - Strategy router when user restores old version → restore_version()
    - SignalService at receipt time → get_version() (for signal audit)
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Save ─────────────────────────────────────────────────────────────────

    async def save_version(
        self,
        strategy: Strategy,
        pine_code: str,
    ) -> StrategyPineVersion:
        """
        Creates an immutable Pine Script version snapshot.

        Bumps Strategy.current_version by 1.
        Must be called BEFORE StrategyService.update_pine_code() in the same transaction.

        Raises ValueError if pine_code is empty.
        Raises ValueError if pine_code is identical to the latest version (no-op protection).
        """
        if not pine_code.strip():
            raise ValueError("Pine Script code cannot be empty.")

        # Check for no-op (identical to latest)
        latest = await self._get_latest(strategy.id)
        if latest and latest.pine_code == pine_code:
            raise ValueError(
                "Pine Script code is identical to the current version. No new version created."
            )

        new_version_number = (latest.version_number + 1) if latest else 1

        version = StrategyPineVersion(
            strategy_id=strategy.id,
            version_number=new_version_number,
            pine_code=pine_code,
        )
        self._db.add(version)

        # Sync strategy's version pointer (Principle 6: Single Source of Truth)
        strategy.current_version = new_version_number
        strategy.pine_code = pine_code
        strategy.updated_at = datetime.now(timezone.utc)

        return version

    # ── Restore ───────────────────────────────────────────────────────────────

    async def restore_version(
        self,
        strategy: Strategy,
        target_version_number: int,
    ) -> StrategyPineVersion:
        """
        Restores a previous Pine Script version by creating a NEW version with the old code.
        This is NOT a rollback — it is an append operation (immutability preserved).

        Example: restore v3 → creates v7 with v3's code content.
        """
        # Find the target version
        result = await self._db.execute(
            select(StrategyPineVersion).where(
                StrategyPineVersion.strategy_id == strategy.id,
                StrategyPineVersion.version_number == target_version_number,
            )
        )
        target = result.scalar_one_or_none()
        if not target:
            raise ValueError(
                f"Version {target_version_number} not found for strategy {strategy.id}."
            )

        # Create a new version with the old code
        return await self.save_version(strategy, target.pine_code)

    # ── Read ──────────────────────────────────────────────────────────────────

    async def list_versions(
        self,
        strategy_id: uuid.UUID,
    ) -> list[StrategyPineVersion]:
        """
        Returns all versions for a strategy, newest first.
        Used by the Strategy page version history panel.
        """
        result = await self._db.execute(
            select(StrategyPineVersion)
            .where(StrategyPineVersion.strategy_id == strategy_id)
            .order_by(StrategyPineVersion.version_number.desc())
        )
        return list(result.scalars().all())

    async def get_version(
        self,
        strategy_id: uuid.UUID,
        version_number: int,
    ) -> StrategyPineVersion | None:
        """
        Returns a specific version by number.
        Called by SignalService during signal audit and by the diff UI.
        """
        result = await self._db.execute(
            select(StrategyPineVersion).where(
                StrategyPineVersion.strategy_id == strategy_id,
                StrategyPineVersion.version_number == version_number,
            )
        )
        return result.scalar_one_or_none()

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _get_latest(
        self,
        strategy_id: uuid.UUID,
    ) -> StrategyPineVersion | None:
        """Returns the highest-version snapshot for a strategy."""
        result = await self._db.execute(
            select(StrategyPineVersion)
            .where(StrategyPineVersion.strategy_id == strategy_id)
            .order_by(StrategyPineVersion.version_number.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
