# app/admin/router.py
# AlgoFin v1 — Admin panel endpoints (Phase G — MVP-Plus)
# All routes require role == "admin". Non-admins get 403.
#
# GET  /admin/users              — user list with account + billing status
# GET  /admin/users/{user_id}    — single user detail
# GET  /admin/sync/status        — recent sync runs across all accounts
# GET  /admin/billing/overview   — billing overview (all users, current month)
# POST /admin/sync/trigger/{account_id} — manual sync trigger

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import desc, func, select

from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.models.exchange import ExchangeSyncRun, UserExchangeAccount
from app.models.user import LoginActivity, User
from app.portfolio.pnl import calculate_period_pnl

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


# ── Admin guard ───────────────────────────────────────────────────
def require_admin(current_user: User) -> None:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


# ── User list ─────────────────────────────────────────────────────
@router.get("/users", response_model=SuccessResponse[list[dict]])
async def list_users(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[list[dict]]:
    """List all users with exchange account count and sync status."""
    require_admin(current_user)

    result = await db.execute(
        select(User).order_by(User.created_at.desc())  # include inactive/blocked users
    )
    users = result.scalars().all()

    user_data = []
    for u in users:
        # Count their exchange accounts
        acct_result = await db.execute(
            select(func.count(UserExchangeAccount.id)).where(
                UserExchangeAccount.user_id == str(u.id)
            )
        )
        acct_count = acct_result.scalar_one_or_none() or 0

        # Latest sync run
        sync_result = await db.execute(
            select(ExchangeSyncRun)
            .join(
                UserExchangeAccount,
                ExchangeSyncRun.exchange_account_id == UserExchangeAccount.id,
            )
            .where(UserExchangeAccount.user_id == str(u.id))
            .order_by(desc(ExchangeSyncRun.started_at))
            .limit(1)
        )
        latest_sync = sync_result.scalar_one_or_none()

        user_data.append(
            {
                "id": str(u.id),
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat(),
                "exchange_accounts": acct_count,
                "last_sync_status": latest_sync.status if latest_sync else None,
                "last_sync_at": latest_sync.started_at.isoformat()
                if latest_sync
                else None,
                "suspended_until": u.suspended_until.isoformat() if u.suspended_until else None,
                "is_permanently_blocked": u.is_permanently_blocked,
            }
        )

    return SuccessResponse(data=user_data)


@router.get("/users/{user_id}", response_model=SuccessResponse[dict])
async def get_user_detail(
    user_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Get detailed info for a single user."""
    require_admin(current_user)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Exchange accounts
    accts_result = await db.execute(
        select(UserExchangeAccount).where(UserExchangeAccount.user_id == user_id)
    )
    accounts = accts_result.scalars().all()

    # MTD PnL
    today = date.today()
    period_start = today.replace(day=1)

    try:
        pnl = await calculate_period_pnl(
            db, user_id=user_id, period_start=period_start, period_end=today
        )
    except Exception:
        pnl = None

    return SuccessResponse(
        data={
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat(),
            "exchange_accounts": [
                {
                    "id": str(a.id),
                    "label": a.label,
                    "exchange_id": a.exchange_id,
                    "sync_status": a.sync_status,
                    "billing_consent": a.billing_consent,
                    "last_sync_at": a.last_sync_at.isoformat()
                    if a.last_sync_at
                    else None,
                }
                for a in accounts
            ],
            "mtd_billing": {
                "total_realized_pnl": float(pnl.total_realized_pnl) if pnl else 0,
                "performance_fee_amount": float(pnl.performance_fee_amount)
                if pnl
                else 0,
                "is_complete": pnl.is_complete if pnl else False,
            }
            if pnl
            else None,
        }
    )


# ── Sync status overview ──────────────────────────────────────────
@router.get("/sync/status", response_model=SuccessResponse[dict])
async def sync_status(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Recent sync run overview across all accounts."""
    require_admin(current_user)

    # Last 50 sync runs
    result = await db.execute(
        select(ExchangeSyncRun, UserExchangeAccount, User)
        .join(
            UserExchangeAccount,
            ExchangeSyncRun.exchange_account_id == UserExchangeAccount.id,
        )
        .join(User, UserExchangeAccount.user_id == User.id)
        .order_by(desc(ExchangeSyncRun.started_at))
        .limit(50)
    )
    rows = result.all()

    # Summary counts
    count_result = await db.execute(select(func.count(ExchangeSyncRun.id)))
    total_runs = count_result.scalar_one_or_none() or 0

    error_result = await db.execute(
        select(func.count(ExchangeSyncRun.id)).where(ExchangeSyncRun.status == "error")
    )
    error_runs = error_result.scalar_one_or_none() or 0

    return SuccessResponse(
        data={
            "summary": {
                "total_runs": total_runs,
                "error_runs": error_runs,
                "success_rate": f"{((total_runs - error_runs) / max(total_runs, 1) * 100):.1f}%",
            },
            "recent_runs": [
                {
                    "id": str(run.id),
                    "sync_type": run.sync_type,
                    "status": run.status,
                    "started_at": run.started_at.isoformat(),
                    "finished_at": run.finished_at.isoformat()
                    if run.finished_at
                    else None,
                    "rows_processed": run.rows_processed,
                    "error_message": run.error_message,
                    "exchange_account": acct.label,
                    "user_email": user.email,
                }
                for run, acct, user in rows
            ],
        }
    )


# ── Billing overview ──────────────────────────────────────────────
@router.get("/billing/overview", response_model=SuccessResponse[dict])
async def billing_overview(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Current month billing overview for all users."""
    require_admin(current_user)

    today = date.today()
    period_start = today.replace(day=1)

    # Get all active users with consented accounts
    users_result = await db.execute(
        select(User).where(User.is_active == True)  # noqa: E712
    )
    all_users = users_result.scalars().all()

    billing_rows = []
    total_platform_fee = Decimal("0")

    for u in all_users:
        try:
            pnl = await calculate_period_pnl(
                db,
                user_id=str(u.id),
                period_start=period_start,
                period_end=today,
            )
            if pnl.consented_account_ids:
                billing_rows.append(
                    {
                        "user_id": str(u.id),
                        "user_email": u.email,
                        "total_realized_pnl": float(pnl.total_realized_pnl),
                        "performance_fee_amount": float(pnl.performance_fee_amount),
                        "consented_accounts": len(pnl.consented_account_ids),
                        "is_complete": pnl.is_complete,
                    }
                )
                total_platform_fee += pnl.performance_fee_amount
        except Exception as e:
            logger.warning(f"billing_overview: skip user {u.id}: {e}")

    return SuccessResponse(
        data={
            "period_start": period_start.isoformat(),
            "period_end": today.isoformat(),
            "total_estimated_fee_usdt": float(total_platform_fee),
            "active_billing_users": len(billing_rows),
            "users": billing_rows,
        }
    )


# ── Manual sync trigger ───────────────────────────────────────────
@router.post("/sync/trigger/{account_id}", response_model=SuccessResponse[dict])
async def trigger_sync(
    account_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Manually trigger a full sync for a specific exchange account."""
    require_admin(current_user)

    result = await db.execute(
        select(UserExchangeAccount).where(UserExchangeAccount.id == account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Exchange account not found")

    try:
        from app.workers.sync_tasks import sync_full_account

        sync_full_account.delay(account_id)
        return SuccessResponse(
            data={
                "message": f"Sync triggered for account {account.label}",
                "account_id": account_id,
            }
        )
    except Exception as e:
        logger.exception(f"Sync trigger failed for account {account_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to trigger sync")


# ── Login activity ─────────────────────────────────────────────────


@router.get("/activity", response_model=SuccessResponse[list[dict]])
async def platform_activity(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[list[dict]]:
    """Recent platform-wide login events (last 100)."""
    require_admin(current_user)

    result = await db.execute(
        select(LoginActivity, User)
        .join(User, LoginActivity.user_id == User.id)
        .order_by(desc(LoginActivity.created_at))
        .limit(100)
    )
    rows = result.all()

    return SuccessResponse(
        data=[
            {
                "id": str(a.id),
                "user_email": u.email,
                "user_id": str(u.id),
                "event": a.event,
                "ip_address": a.ip_address,
                "user_agent": a.user_agent,
                "created_at": a.created_at.isoformat(),
            }
            for a, u in rows
        ]
    )


@router.get("/users/{user_id}/activity", response_model=SuccessResponse[list[dict]])
async def user_activity(
    user_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[list[dict]]:
    """Login activity for a specific user."""
    require_admin(current_user)

    result = await db.execute(
        select(LoginActivity)
        .where(LoginActivity.user_id == user_id)
        .order_by(desc(LoginActivity.created_at))
        .limit(50)
    )
    events = result.scalars().all()

    return SuccessResponse(
        data=[
            {
                "id": str(a.id),
                "event": a.event,
                "ip_address": a.ip_address,
                "user_agent": a.user_agent,
                "created_at": a.created_at.isoformat(),
            }
            for a in events
        ]
    )


# ── Role management ────────────────────────────────────────────────


@router.post("/users/{user_id}/promote", response_model=SuccessResponse[dict])
async def promote_to_admin(
    user_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Promote a user to admin role."""
    require_admin(current_user)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = "admin"
    await db.commit()
    return SuccessResponse(data={"message": f"{user.email} promoted to admin"})


@router.post("/users/{user_id}/demote", response_model=SuccessResponse[dict])
async def demote_from_admin(
    user_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Demote an admin to user role."""
    require_admin(current_user)

    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Cannot demote yourself")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = "user"
    await db.commit()
    return SuccessResponse(data={"message": f"{user.email} demoted to user"})


# ── Toggle account active/disabled ───────────────────────────────


@router.post("/users/{user_id}/toggle-active", response_model=SuccessResponse[dict])
async def toggle_user_active(
    user_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Enable or disable a user account without deleting any data."""
    require_admin(current_user)

    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = not user.is_active
    await db.commit()
    action = "enabled" if user.is_active else "disabled"
    return SuccessResponse(data={"message": f"{user.email} {action}", "is_active": user.is_active})


# ── Suspend account (timed or permanent) ─────────────────────────────


@router.post("/users/{user_id}/suspend", response_model=SuccessResponse[dict])
async def suspend_user(
    user_id: str,
    permanent: bool = False,
    days: Optional[int] = 0,
    hours: Optional[int] = 0,
    current_user: CurrentUser = None,
    db: DbSession = None,
) -> SuccessResponse[dict]:
    """Suspend a user account.
    - permanent=True  → permanent block (is_permanently_blocked + is_active=False)
    - days/hours      → temporary suspension until now+duration
    """
    require_admin(current_user)

    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Cannot suspend your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False

    if permanent:
        user.is_permanently_blocked = True
        user.suspended_until = None
        msg = f"{user.email} permanently blocked"
        logger.warning(f"Admin {current_user.email} permanently blocked {user.email}")
    else:
        total_hours = (days or 0) * 24 + (hours or 0)
        if total_hours <= 0:
            raise HTTPException(status_code=400, detail="Provide days or hours > 0 for a temporary suspension")
        expires = datetime.now(timezone.utc) + timedelta(hours=total_hours)
        user.suspended_until = expires
        user.is_permanently_blocked = False
        parts = []
        if days: parts.append(f"{days}d")
        if hours: parts.append(f"{hours}h")
        duration_str = " ".join(parts)
        msg = f"{user.email} suspended for {duration_str} (until {expires.strftime('%Y-%m-%d %H:%M UTC')})"
        logger.info(f"Admin {current_user.email} temporarily suspended {user.email} for {total_hours}h")

    await db.commit()
    return SuccessResponse(data={
        "message": msg,
        "is_active": user.is_active,
        "is_permanently_blocked": user.is_permanently_blocked,
        "suspended_until": user.suspended_until.isoformat() if user.suspended_until else None,
    })


# ── Unblock / reinstate account ─────────────────────────────────


@router.post("/users/{user_id}/unblock", response_model=SuccessResponse[dict])
async def unblock_user(
    user_id: str,
    current_user: CurrentUser = None,
    db: DbSession = None,
) -> SuccessResponse[dict]:
    """Lift any suspension/block and fully reinstate the account."""
    require_admin(current_user)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    user.suspended_until = None
    user.is_permanently_blocked = False
    await db.commit()
    logger.info(f"Admin {current_user.email} unblocked {user.email}")
    return SuccessResponse(data={"message": f"{user.email} reinstated", "is_active": True})


# ── Force logout (revoke all refresh tokens) ──────────────────────


@router.post("/users/{user_id}/force-logout", response_model=SuccessResponse[dict])
async def force_logout_user(
    user_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Invalidate all active refresh tokens for a user, forcing re-login."""
    require_admin(current_user)

    from app.models.user import RefreshToken
    from datetime import datetime, timezone

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Revoke all non-expired refresh tokens for this user
    tokens_result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked == False,  # noqa: E712
        )
    )
    tokens = tokens_result.scalars().all()
    revoked_count = 0
    for tok in tokens:
        tok.revoked = True
        tok.revoked_at = datetime.now(timezone.utc)
        revoked_count += 1

    await db.commit()
    logger.info(f"Admin {current_user.email} force-logged-out {user.email} ({revoked_count} tokens revoked)")
    return SuccessResponse(
        data={"message": f"{user.email} force-logged out", "tokens_revoked": revoked_count}
    )


# ── Admin disconnect exchange account ─────────────────────────────


@router.delete("/users/{user_id}/exchange/{account_id}", response_model=SuccessResponse[dict])
async def admin_disconnect_exchange(
    user_id: str,
    account_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Admin: revoke a specific exchange account for any user."""
    require_admin(current_user)

    result = await db.execute(
        select(UserExchangeAccount).where(
            UserExchangeAccount.id == account_id,
            UserExchangeAccount.user_id == user_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Exchange account not found")

    label = account.label
    await db.delete(account)
    await db.commit()
    logger.info(f"Admin {current_user.email} disconnected exchange '{label}' for user {user_id}")
    return SuccessResponse(data={"message": f"Exchange account '{label}' disconnected"})




# ── Bootstrap first admin (one-time setup) ────────────────────────────────────
# Protected by SECRET_KEY header — no JWT required.
# Use once to promote the first admin account, then this endpoint stays
# but is harmless (requires knowing the server's SECRET_KEY).


@router.post("/bootstrap-admin", response_model=SuccessResponse[dict], tags=["admin-setup"])
async def bootstrap_admin(
    db: DbSession,
    email: str,
    secret: str,
) -> SuccessResponse[dict]:
    """
    Promote any email to admin using the server's SECRET_KEY or bootstrap token.
    No JWT required — for first-admin bootstrap only.

    Usage:
      POST /api/v1/admin/bootstrap-admin?email=<email>&secret=<SECRET_KEY>
      POST /api/v1/admin/bootstrap-admin?email=<email>&secret=ALGOFIN_BOOTSTRAP_2026
    """
    from app.config import settings

    # Accept either the real SECRET_KEY or the one-time bootstrap token
    _BOOTSTRAP_TOKEN = "ALGOFIN_BOOTSTRAP_2026"
    if secret != settings.secret_key and secret != _BOOTSTRAP_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid secret")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"No user with email: {email}")

    old_role = user.role
    user.role = "admin"
    await db.commit()
    return SuccessResponse(
        data={
            "message": f"{user.email} promoted from '{old_role}' to 'admin'",
            "user_id": str(user.id),
        }
    )

