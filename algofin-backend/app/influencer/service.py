# app/influencer/service.py
# Phase INF: InfluencerService — admin and user business logic
#
# Owns:
#   - Strategy CRUD (admin)
#   - Secret lifecycle (bcrypt hash on create/rotate, plain returned once)
#   - Subscription lifecycle (subscribe, pause, resume, stop, update)
#   - Read operations (marketplace, subscriptions, executions)
#
# Does NOT own:
#   - Signal ingestion (→ signal_service.py)
#   - Fan-out / order execution (→ fanout_worker.py)

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.influencer import (
    InfluencerSignal,
    InfluencerStrategy,
    InfluencerSubscription,
    InfluencerSubscriberExecution,
)
from app.influencer.schemas import (
    InfluencerStrategyCreate,
    InfluencerStrategyUpdate,
    SubscriptionCreate,
    SubscriptionUpdate,
    AdminSubscriberRow,
)

logger = logging.getLogger(__name__)

_BCRYPT_ROUNDS = 10


def _hash_secret(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode()


def _generate_plain_secret() -> str:
    """32 bytes = 43-char URL-safe string."""
    return secrets.token_urlsafe(32)


def _webhook_url(strategy_id: str) -> str:
    return f"https://algofin-api.onrender.com/api/v1/webhooks/inf/{strategy_id}"



# ── Admin: Strategy management ────────────────────────────────────────────────


async def create_strategy(
    db: AsyncSession,
    data: InfluencerStrategyCreate,
    admin_user_id: str,
) -> tuple[InfluencerStrategy, str]:
    """
    Create a new influencer strategy.

    Returns (strategy, plain_secret).
    plain_secret is shown once — only bcrypt hash is persisted.
    """
    secret_hash = _hash_secret(data.plain_secret)

    strategy = InfluencerStrategy(
        strategy_code=data.strategy_code,
        name=data.name,
        description=data.description,
        creator_name=data.creator_name,
        creator_avatar_url=data.creator_avatar_url,
        supported_markets=data.supported_markets,
        recommended_timeframe=data.recommended_timeframe,
        risk_level=data.risk_level,
        backtested_return=data.backtested_return,
        max_drawdown=data.max_drawdown,
        win_rate=data.win_rate,
        total_trades=data.total_trades,
        equity_curve=data.equity_curve,
        pine_code=data.pine_code,
        webhook_secret_hash=secret_hash,
        status="draft",
        version=data.version,
        created_by=uuid.UUID(admin_user_id),
    )
    db.add(strategy)
    await db.commit()
    await db.refresh(strategy)
    logger.info(f"[Influencer] Strategy created: {strategy.strategy_code} ({strategy.id})")
    return strategy, data.plain_secret


async def update_strategy(
    db: AsyncSession,
    strategy_id: str,
    data: InfluencerStrategyUpdate,
) -> InfluencerStrategy:
    """Patch an existing strategy. Raises ValueError if not found."""
    strategy = await _get_strategy_or_raise(db, strategy_id)

    patch = data.model_dump(exclude_none=True)
    for field, value in patch.items():
        setattr(strategy, field, value)

    strategy.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(strategy)
    logger.info(f"[Influencer] Strategy updated: {strategy.strategy_code}")
    return strategy


async def archive_strategy(db: AsyncSession, strategy_id: str) -> InfluencerStrategy:
    """Set status=archived. Irreversible from user-facing flows."""
    strategy = await _get_strategy_or_raise(db, strategy_id)
    strategy.status = "archived"
    strategy.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(strategy)
    logger.info(f"[Influencer] Strategy archived: {strategy.strategy_code}")
    return strategy


async def rotate_secret(
    db: AsyncSession,
    strategy_id: str,
) -> tuple[InfluencerStrategy, str]:
    """
    Generate a new webhook secret. Returns (strategy, plain_secret).
    Old secret is immediately invalidated (no grace period for influencer secrets).
    """
    strategy = await _get_strategy_or_raise(db, strategy_id)
    plain = _generate_plain_secret()
    strategy.webhook_secret_hash = _hash_secret(plain)
    strategy.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(strategy)
    logger.info(f"[Influencer] Secret rotated for: {strategy.strategy_code}")
    return strategy, plain


async def get_all_strategies_admin(
    db: AsyncSession,
) -> list[InfluencerStrategy]:
    """Admin: list all strategies (all statuses), newest first."""
    result = await db.execute(
        select(InfluencerStrategy).order_by(InfluencerStrategy.created_at.desc())
    )
    return list(result.scalars().all())


async def get_strategy_admin(
    db: AsyncSession,
    strategy_id: str,
) -> InfluencerStrategy:
    return await _get_strategy_or_raise(db, strategy_id)


async def get_admin_subscribers(
    db: AsyncSession,
    strategy_id: str,
) -> list[AdminSubscriberRow]:
    """Admin: list all subscriptions for a strategy with user info."""
    from app.models.user import User  # avoid circular at top level

    result = await db.execute(
        select(InfluencerSubscription, User.email)
        .join(User, InfluencerSubscription.user_id == User.id)
        .where(InfluencerSubscription.influencer_strategy_id == uuid.UUID(strategy_id))
        .order_by(InfluencerSubscription.created_at.desc())
    )
    rows = result.all()
    return [
        AdminSubscriberRow(
            subscription_id=str(sub.id),
            user_id=str(sub.user_id),
            user_email=email,
            symbol=sub.symbol,
            capital_usdt=str(sub.capital_usdt),
            leverage=sub.leverage,
            status=sub.status,
            created_at=sub.created_at.isoformat(),
        )
        for sub, email in rows
    ]


async def get_strategy_signals_admin(
    db: AsyncSession,
    strategy_id: str,
    limit: int = 50,
    offset: int = 0,
) -> list[InfluencerSignal]:
    """Admin: signal history for a strategy."""
    result = await db.execute(
        select(InfluencerSignal)
        .where(InfluencerSignal.influencer_strategy_id == uuid.UUID(strategy_id))
        .order_by(InfluencerSignal.received_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


# ── User-facing: Marketplace ──────────────────────────────────────────────────


async def get_marketplace(db: AsyncSession) -> list[InfluencerStrategy]:
    """Public: list active strategies for marketplace grid."""
    result = await db.execute(
        select(InfluencerStrategy)
        .where(InfluencerStrategy.status == "active")
        .order_by(InfluencerStrategy.created_at.desc())
    )
    return list(result.scalars().all())


async def get_strategy_public(
    db: AsyncSession,
    strategy_id: str,
) -> InfluencerStrategy:
    """Public: single strategy detail (active only)."""
    strategy = await _get_strategy_or_raise(db, strategy_id)
    if strategy.status != "active":
        raise ValueError("Strategy not found")
    return strategy


# ── User-facing: Subscriptions ────────────────────────────────────────────────


async def subscribe(
    db: AsyncSession,
    user_id: str,
    data: SubscriptionCreate,
) -> InfluencerSubscription:
    """
    Subscribe user to a strategy.
    If a stopped subscription for the same (user, strategy, account, symbol) exists,
    reactivate it with the new settings.
    Raises ValueError if strategy is not active.
    """
    strategy = await _get_strategy_or_raise(db, data.influencer_strategy_id)
    if strategy.status != "active":
        raise ValueError("Cannot subscribe to a strategy that is not active")

    # Check for existing subscription (stopped → reactivate)
    existing_result = await db.execute(
        select(InfluencerSubscription).where(
            InfluencerSubscription.user_id == uuid.UUID(user_id),
            InfluencerSubscription.influencer_strategy_id == uuid.UUID(data.influencer_strategy_id),
            InfluencerSubscription.exchange_account_id == uuid.UUID(data.exchange_account_id),
            InfluencerSubscription.symbol == data.symbol,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        if existing.status in ("active", "paused"):
            raise ValueError(
                f"Already subscribed to this strategy on {data.symbol}. "
                "Update or stop the existing subscription first."
            )
        # Reactivate stopped subscription with new settings
        existing.capital_usdt = data.capital_usdt
        existing.leverage = data.leverage
        existing.status = "active"
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return existing

    sub = InfluencerSubscription(
        user_id=uuid.UUID(user_id),
        influencer_strategy_id=uuid.UUID(data.influencer_strategy_id),
        exchange_account_id=uuid.UUID(data.exchange_account_id),
        symbol=data.symbol,
        capital_usdt=data.capital_usdt,
        leverage=data.leverage,
        status="active",
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    logger.info(
        f"[Influencer] User {user_id} subscribed to "
        f"{strategy.strategy_code} on {data.symbol}"
    )
    return sub


async def update_subscription(
    db: AsyncSession,
    user_id: str,
    subscription_id: str,
    data: SubscriptionUpdate,
) -> InfluencerSubscription:
    sub = await _get_sub_or_raise(db, user_id, subscription_id)
    if sub.status == "stopped":
        raise ValueError("Cannot update a stopped subscription")
    patch = data.model_dump(exclude_none=True)
    for field, value in patch.items():
        setattr(sub, field, value)
    sub.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(sub)
    return sub


async def pause_subscription(
    db: AsyncSession,
    user_id: str,
    subscription_id: str,
) -> InfluencerSubscription:
    sub = await _get_sub_or_raise(db, user_id, subscription_id)
    if sub.status != "active":
        raise ValueError(f"Cannot pause subscription in status: {sub.status}")
    sub.status = "paused"
    sub.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(sub)
    return sub


async def resume_subscription(
    db: AsyncSession,
    user_id: str,
    subscription_id: str,
) -> InfluencerSubscription:
    sub = await _get_sub_or_raise(db, user_id, subscription_id)
    if sub.status != "paused":
        raise ValueError(f"Cannot resume subscription in status: {sub.status}")
    sub.status = "active"
    sub.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(sub)
    return sub


async def stop_subscription(
    db: AsyncSession,
    user_id: str,
    subscription_id: str,
) -> InfluencerSubscription:
    sub = await _get_sub_or_raise(db, user_id, subscription_id)
    if sub.status == "stopped":
        raise ValueError("Subscription is already stopped")
    sub.status = "stopped"
    sub.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(sub)
    return sub


async def get_my_subscriptions(
    db: AsyncSession,
    user_id: str,
) -> list[tuple[InfluencerSubscription, InfluencerStrategy]]:
    """Return user's subscriptions with strategy info joined."""
    result = await db.execute(
        select(InfluencerSubscription, InfluencerStrategy)
        .join(
            InfluencerStrategy,
            InfluencerSubscription.influencer_strategy_id == InfluencerStrategy.id,
        )
        .where(InfluencerSubscription.user_id == uuid.UUID(user_id))
        .order_by(InfluencerSubscription.created_at.desc())
    )
    return result.all()


async def get_subscription_executions(
    db: AsyncSession,
    user_id: str,
    subscription_id: str,
    limit: int = 50,
    offset: int = 0,
) -> list[InfluencerSubscriberExecution]:
    """Execution history for a specific subscription (user-scoped)."""
    sub = await _get_sub_or_raise(db, user_id, subscription_id)
    result = await db.execute(
        select(InfluencerSubscriberExecution)
        .where(InfluencerSubscriberExecution.subscription_id == sub.id)
        .order_by(InfluencerSubscriberExecution.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


# ── Internal helpers ──────────────────────────────────────────────────────────


async def _get_strategy_or_raise(
    db: AsyncSession,
    strategy_id: str,
) -> InfluencerStrategy:
    try:
        sid = uuid.UUID(strategy_id)
    except ValueError:
        raise ValueError("Invalid strategy ID")

    result = await db.execute(
        select(InfluencerStrategy).where(InfluencerStrategy.id == sid)
    )
    strategy = result.scalar_one_or_none()
    if strategy is None:
        raise ValueError(f"Strategy not found: {strategy_id}")
    return strategy


async def _get_sub_or_raise(
    db: AsyncSession,
    user_id: str,
    subscription_id: str,
) -> InfluencerSubscription:
    result = await db.execute(
        select(InfluencerSubscription).where(
            InfluencerSubscription.id == uuid.UUID(subscription_id),
            InfluencerSubscription.user_id == uuid.UUID(user_id),
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        raise PermissionError("Subscription not found or not authorized")
    return sub
