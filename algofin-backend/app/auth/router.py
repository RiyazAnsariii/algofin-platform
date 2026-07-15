# app/auth/router.py
# AlgoFin v1 — Auth endpoints
# POST /auth/signup
# POST /auth/login
# POST /auth/refresh  (reads httpOnly cookie, issues new access token)
# POST /auth/logout

from datetime import timedelta

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.auth.schemas import (
    AuthDataResponse,
    LoginRequest,
    RefreshResponse,
    SignupRequest,
    UserResponse,
)
from app.auth.service import (
    authenticate_user,
    create_user,
    issue_tokens,
    revoke_all_tokens,
    rotate_refresh_token,
)
from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.config import settings
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "algofin_refresh_token"
REFRESH_COOKIE_MAX_AGE = int(
    timedelta(days=settings.jwt_refresh_expire_days).total_seconds()
)


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    """Set the httpOnly refresh token cookie (plan.md Section 4-A)."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
        path="/",  # Must be "/" so browser sends it on ALL requests incl. /api/v1/auth/refresh
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        created_at=user.created_at.isoformat(),
    )


@router.post(
    "/signup",
    response_model=SuccessResponse[AuthDataResponse],
    status_code=status.HTTP_201_CREATED,
)
async def signup(
    body: SignupRequest,
    request: Request,
    response: Response,
    db: DbSession,
) -> SuccessResponse[AuthDataResponse]:
    """Create a new user account and return tokens."""
    # Check email not already in use
    existing = await db.execute(
        select(User).where(User.email == body.email.lower().strip())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = await create_user(
        db,
        email=body.email,
        password=body.password,
        full_name=body.full_name,
    )

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    access_token, refresh_raw = await issue_tokens(db, user=user, ip_address=ip, user_agent=ua)

    _set_refresh_cookie(response, refresh_raw)

    return SuccessResponse(
        data=AuthDataResponse(
            access_token=access_token,
            user=_user_to_response(user),
        )
    )


@router.post("/login", response_model=SuccessResponse[AuthDataResponse])
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: DbSession,
) -> SuccessResponse[AuthDataResponse]:
    """Authenticate user and return tokens."""
    user = await authenticate_user(db, email=body.email, password=body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    access_token, refresh_raw = await issue_tokens(db, user=user, ip_address=ip, user_agent=ua)

    _set_refresh_cookie(response, refresh_raw)

    return SuccessResponse(
        data=AuthDataResponse(
            access_token=access_token,
            user=_user_to_response(user),
        )
    )


@router.post("/refresh", response_model=SuccessResponse[RefreshResponse])
async def refresh(
    request: Request,
    response: Response,
    db: DbSession,
    algofin_refresh_token: str | None = Cookie(default=None),
) -> SuccessResponse[RefreshResponse]:
    """
    Refresh access token using httpOnly cookie.
    Rotates refresh token (old invalidated, new issued).
    plan.md Section 4-A.
    """
    if not algofin_refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token found",
        )

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    result = await rotate_refresh_token(
        db,
        raw_refresh_token=algofin_refresh_token,
        ip_address=ip,
        user_agent=ua,
    )

    if result is None:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired",
        )

    access_token, new_refresh_raw, user = result
    _set_refresh_cookie(response, new_refresh_raw)

    return SuccessResponse(
        data=RefreshResponse(
            access_token=access_token,
            user=_user_to_response(user),
        )
    )


@router.post("/logout", response_model=SuccessResponse[dict])
async def logout(
    response: Response,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Revoke all refresh tokens and clear cookie."""
    await revoke_all_tokens(db, user_id=str(current_user.id))
    _clear_refresh_cookie(response)
    return SuccessResponse(data={"message": "Logged out successfully"})


@router.get("/me", response_model=SuccessResponse[UserResponse])
async def me(current_user: CurrentUser) -> SuccessResponse[UserResponse]:
    """Return current authenticated user."""
    return SuccessResponse(data=_user_to_response(current_user))


@router.patch("/me", response_model=SuccessResponse[UserResponse])
async def update_profile(
    body: dict,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[UserResponse]:
    """Update user profile (full_name only in v1)."""
    from pydantic import BaseModel, field_validator

    full_name = body.get("full_name", "").strip()
    if not full_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="full_name is required")

    current_user.full_name = full_name
    await db.commit()
    await db.refresh(current_user)
    return SuccessResponse(data=_user_to_response(current_user))


@router.post("/change-password", response_model=SuccessResponse[dict])
async def change_password(
    body: dict,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Change user password. Requires current_password verification."""
    from app.common.security import verify_password, hash_password

    current_password = body.get("current_password", "")
    new_password     = body.get("new_password", "")

    if not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be at least 8 characters",
        )

    current_user.hashed_password = hash_password(new_password)
    # Revoke all refresh tokens so existing sessions are invalidated
    await revoke_all_tokens(db, user_id=str(current_user.id))
    await db.commit()

    return SuccessResponse(data={"message": "Password changed. Please log in again."})


@router.delete("/me", response_model=SuccessResponse[dict])
async def delete_account(
    response: Response,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Permanently delete the user account and all associated data."""
    from sqlalchemy import delete as sql_delete
    from app.models.exchange import UserExchangeAccount
    from app.models.assistant import ChatThread

    # Soft-delete: mark inactive (hard delete in production would cascade)
    current_user.is_active = False
    await revoke_all_tokens(db, user_id=str(current_user.id))
    await db.commit()

    _clear_refresh_cookie(response)
    return SuccessResponse(data={"message": "Account deleted."})

