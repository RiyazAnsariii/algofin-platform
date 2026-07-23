# app/auth/service.py
# AlgoFin v1 — Auth business logic

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.security import (
    create_access_token,
    create_refresh_token_raw,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.config import settings
from app.models.user import LoginActivity, RefreshToken, User


async def create_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    full_name: str,
    role: str = "user",
) -> User:
    """Create a new user with hashed password."""
    user = User(
        email=email.lower().strip(),
        hashed_password=hash_password(password),
        full_name=full_name.strip(),
        role=role,
    )
    db.add(user)
    await db.flush()  # flush to get user.id
    return user


async def authenticate_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
) -> User | None:
    """Return User if credentials are valid, None otherwise."""
    result = await db.execute(select(User).where(User.email == email.lower().strip()))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def issue_tokens(
    db: AsyncSession,
    *,
    user: User,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[str, str]:
    """
    Issue a new access token + refresh token pair.
    Stores hashed refresh token in DB.
    Returns (access_token_raw, refresh_token_raw).
    The raw refresh token is set as an httpOnly cookie by the caller.
    """
    # Create access token
    access_token = create_access_token({"sub": str(user.id), "role": user.role})

    # Create refresh token
    refresh_raw = create_refresh_token_raw()
    refresh_hash = hash_refresh_token(refresh_raw)
    expires = datetime.now(timezone.utc) + timedelta(
        days=settings.jwt_refresh_expire_days
    )

    db_token = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=expires,
    )
    db.add(db_token)

    # Log login activity
    activity = LoginActivity(
        user_id=user.id,
        event="login_success",
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(activity)

    await db.commit()
    return access_token, refresh_raw


async def rotate_refresh_token(
    db: AsyncSession,
    *,
    raw_refresh_token: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[str, str, User] | None:
    """
    Refresh token rotation (plan.md Section 4-A):
      1. Look up hashed token
      2. Verify not revoked and not expired
      3. Revoke old token
      4. Issue new token pair
    Returns (new_access_token, new_refresh_token, user) or None if invalid.
    """
    token_hash = hash_refresh_token(raw_refresh_token)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,  # noqa: E712
            RefreshToken.expires_at > now,
        )
    )
    db_token = result.scalar_one_or_none()
    if db_token is None:
        return None

    # Load user
    user_result = await db.execute(select(User).where(User.id == db_token.user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None

    # Revoke old token
    db_token.revoked = True
    db_token.revoked_at = now

    # Issue new pair
    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    new_refresh_raw = create_refresh_token_raw()
    new_refresh_hash = hash_refresh_token(new_refresh_raw)
    new_expires = now + timedelta(days=settings.jwt_refresh_expire_days)

    new_db_token = RefreshToken(
        user_id=user.id,
        token_hash=new_refresh_hash,
        expires_at=new_expires,
    )
    db.add(new_db_token)

    # Log activity
    db.add(
        LoginActivity(
            user_id=user.id,
            event="token_refreshed",
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )

    await db.commit()
    return access_token, new_refresh_raw, user


async def revoke_all_tokens(db: AsyncSession, *, user_id: str) -> None:
    """Revoke all refresh tokens for a user (logout)."""
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked == False,  # noqa: E712
        )
    )
    tokens = result.scalars().all()
    now = datetime.now(timezone.utc)
    for t in tokens:
        t.revoked = True
        t.revoked_at = now
    await db.commit()
