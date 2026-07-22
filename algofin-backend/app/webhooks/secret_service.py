# app/webhooks/secret_service.py
# AlgoFin v2 — Phase M: SecretService
#
# SecretService owns the per-strategy webhook secret lifecycle:
#   - generate  — creates a new secret (called on strategy publish)
#   - rotate    — replaces active secret, puts old into 5-min grace period
#   - verify    — bcrypt.checkpw against all active/grace_period secrets
#   - revoke    — immediately revokes all secrets (strategy archived)
#
# Security invariants enforced here:
#   - Plain secret is generated, returned ONCE, never persisted
#   - Only the bcrypt hash is stored (secret_hash column)
#   - At most ONE active secret per strategy at any time
#   - Grace period: old secret remains valid for 5 minutes after rotation
#   - Brute-force: tracked by caller (WebhookService), not here

import secrets
import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.strategy import StrategyWebhookSecret


class SecretService:
    """
    Owns the StrategyWebhookSecret lifecycle.

    Called by:
    - StrategyService.publish() → generate()
    - WebhookService           → verify()
    - Strategy router          → rotate(), revoke()

    Does NOT own:
    - Strategy state (→ StrategyService)
    - Signal processing (→ SignalService)
    """

    # bcrypt work factor — intentionally slow (80ms per verify in latency budget)
    BCRYPT_ROUNDS = 10

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Generate ─────────────────────────────────────────────────────────────

    async def generate(self, strategy_id: uuid.UUID) -> str:
        """
        Creates a fresh webhook secret for a strategy.
        Returns the plain-text secret — this is the ONLY time it is visible.
        Stores only the bcrypt hash.

        Called on strategy publish (draft → active).
        Assumes no active secret exists (raises if one does — call rotate() instead).
        """
        plain = self._new_plain_secret()
        secret_hash = self._hash(plain)

        # Verify no active secret already exists (invariant)
        existing = await self._db.execute(
            select(StrategyWebhookSecret).where(
                StrategyWebhookSecret.strategy_id == strategy_id,
                StrategyWebhookSecret.status == "active",
            )
        )
        if existing.scalar_one_or_none():
            raise RuntimeError(
                f"Strategy {strategy_id} already has an active secret. Use rotate() instead."
            )

        row = StrategyWebhookSecret(
            strategy_id=strategy_id,
            secret_hash=secret_hash,
            status="active",
        )
        self._db.add(row)
        return plain

    # ── Rotate ────────────────────────────────────────────────────────────────

    async def rotate(self, strategy_id: uuid.UUID) -> str:
        """
        Rotates the webhook secret:
        1. Moves the current ACTIVE secret to GRACE_PERIOD (5 min TTL)
        2. Creates a new ACTIVE secret
        3. Returns the new plain-text secret

        During the grace period, BOTH secrets are accepted.
        After grace_expires_at, the old secret is rejected.
        """
        now = datetime.now(timezone.utc)
        grace_expires = now + timedelta(seconds=settings.webhook_secret_grace_seconds)

        # Move current active → grace_period
        old = await self._db.execute(
            select(StrategyWebhookSecret).where(
                StrategyWebhookSecret.strategy_id == strategy_id,
                StrategyWebhookSecret.status == "active",
            )
        )
        old_secret = old.scalar_one_or_none()
        if old_secret:
            old_secret.status = "grace_period"
            old_secret.grace_expires_at = grace_expires

        # Generate new active secret
        plain = self._new_plain_secret()
        new_row = StrategyWebhookSecret(
            strategy_id=strategy_id,
            secret_hash=self._hash(plain),
            status="active",
            rotated_from_id=old_secret.id if old_secret else None,
        )
        self._db.add(new_row)
        return plain

    # ── Verify ────────────────────────────────────────────────────────────────

    async def verify(self, strategy_id: uuid.UUID, plain_secret: str) -> bool:
        """
        Verifies that plain_secret matches any active or valid grace_period secret.

        Returns True if verified, False otherwise.
        Never raises — returns False on any error (avoids information leakage).

        Latency note: bcrypt.checkpw() takes ~80ms per call.
        This is intentional — it is in the webhook latency budget.
        """
        try:
            now = datetime.now(timezone.utc)
            result = await self._db.execute(
                select(StrategyWebhookSecret).where(
                    StrategyWebhookSecret.strategy_id == strategy_id,
                    StrategyWebhookSecret.status.in_(["active", "grace_period"]),
                )
            )
            candidates = result.scalars().all()

            for candidate in candidates:
                # Skip expired grace period secrets
                if (
                    candidate.status == "grace_period"
                    and candidate.grace_expires_at
                    and now > candidate.grace_expires_at
                ):
                    continue

                # bcrypt comparison — constant-time check
                if bcrypt.checkpw(
                    plain_secret.encode("utf-8"),
                    candidate.secret_hash.encode("utf-8"),
                ):
                    return True

            return False
        except Exception:
            return False

    # ── Revoke All ────────────────────────────────────────────────────────────

    async def revoke_all(self, strategy_id: uuid.UUID) -> None:
        """
        Immediately revokes ALL secrets for a strategy.
        Called when strategy is ARCHIVED (no further signals accepted).
        """
        now = datetime.now(timezone.utc)
        await self._db.execute(
            update(StrategyWebhookSecret)
            .where(
                StrategyWebhookSecret.strategy_id == strategy_id,
                StrategyWebhookSecret.status != "revoked",
            )
            .values(status="revoked", revoked_at=now)
        )

    # ── Reconciliation ────────────────────────────────────────────────────────

    async def expire_grace_periods(self) -> int:
        """
        Revokes grace_period secrets whose grace_expires_at has passed.
        Called by the reconciliation background job every minute.
        Returns count of secrets revoked.
        """
        now = datetime.now(timezone.utc)
        result = await self._db.execute(
            select(StrategyWebhookSecret).where(
                StrategyWebhookSecret.status == "grace_period",
                StrategyWebhookSecret.grace_expires_at < now,
            )
        )
        expired = result.scalars().all()
        for secret in expired:
            secret.status = "revoked"
            secret.revoked_at = now
        return len(expired)

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _new_plain_secret() -> str:
        """Generates a 32-byte URL-safe random secret (256 bits of entropy)."""
        return secrets.token_urlsafe(32)

    @staticmethod
    def _hash(plain: str) -> str:
        """Returns a bcrypt hash of plain. Work factor: BCRYPT_ROUNDS."""
        salt = bcrypt.gensalt(rounds=SecretService.BCRYPT_ROUNDS)
        return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")
