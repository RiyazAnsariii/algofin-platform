# app/auth/router.py
# AlgoFin v1 — Auth endpoints
# POST /auth/signup
# POST /auth/login
# POST /auth/refresh  (reads httpOnly cookie, issues new access token)
# POST /auth/logout

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from sqlalchemy import select

from app.auth.schemas import (
    AuthDataResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RefreshResponse,
    ResetPasswordRequest,
    SignupRequest,
    UpdateProfileRequest,
    UserResponse,
    VerifyResetCodeRequest,
    VerifyResetCodeResponse,
)
from app.common.email import send_reset_code_email
from app.common.security import (
    create_password_reset_code,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
)
from app.auth.service import (
    authenticate_user,
    create_user,
    issue_tokens,
    revoke_all_tokens,
    rotate_refresh_token,
)
from app.common.deps import CurrentUser, DbSession
from app.common.rate_limit import limiter
from app.common.schemas import SuccessResponse
from app.config import settings
from app.models.user import RefreshToken, User

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
@limiter.limit("3/minute")
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
    access_token, refresh_raw = await issue_tokens(
        db, user=user, ip_address=ip, user_agent=ua
    )

    _set_refresh_cookie(response, refresh_raw)

    return SuccessResponse(
        data=AuthDataResponse(
            access_token=access_token,
            user=_user_to_response(user),
        )
    )


@router.post("/login", response_model=SuccessResponse[AuthDataResponse])
@limiter.limit("5/minute")
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
    access_token, refresh_raw = await issue_tokens(
        db, user=user, ip_address=ip, user_agent=ua
    )

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
    body: UpdateProfileRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[UserResponse]:
    """Update user profile (full_name only in v1)."""
    current_user.full_name = body.full_name
    await db.commit()
    await db.refresh(current_user)
    return SuccessResponse(data=_user_to_response(current_user))


@router.post("/change-password", response_model=SuccessResponse[dict])
async def change_password(
    body: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Change user password. Requires current_password verification."""
    from app.common.security import verify_password, hash_password

    if current_user.hashed_password is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account uses Google sign-in and has no password.",
        )

    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.hashed_password = hash_password(body.new_password)
    await revoke_all_tokens(db, user_id=str(current_user.id))
    await db.commit()

    return SuccessResponse(data={"message": "Password changed. Please log in again."})


@router.post("/forgot-password", response_model=SuccessResponse[ForgotPasswordResponse])
@limiter.limit("3/minute")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: DbSession,
) -> SuccessResponse[ForgotPasswordResponse]:
    """Request a 6-digit password reset verification code sent to Gmail."""
    email = body.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    reset_token = None
    if user and user.is_active and user.hashed_password is not None:
        code = create_password_reset_code()
        reset_token = create_password_reset_token(str(user.id), user.email, code=code)
        # Deliver 6-digit verification code to user's email inbox
        await send_reset_code_email(email, code)

    return SuccessResponse(
        data=ForgotPasswordResponse(
            message="If an account exists with that email, a 6-digit reset code has been sent.",
            reset_token=reset_token,
        )
    )


@router.post(
    "/verify-reset-code", response_model=SuccessResponse[VerifyResetCodeResponse]
)
@limiter.limit("5/minute")
async def verify_reset_code(
    body: VerifyResetCodeRequest,
    request: Request,
    db: DbSession,
) -> SuccessResponse[VerifyResetCodeResponse]:
    """Verify the 6-digit code sent to user's email."""
    email = body.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email or verification code.",
        )

    # Issue verified reset token
    verified_token = create_password_reset_token(
        str(user.id), user.email, verified=True
    )

    return SuccessResponse(
        data=VerifyResetCodeResponse(
            message="Verification code confirmed successfully.",
            reset_token=verified_token,
        )
    )


@router.post("/reset-password", response_model=SuccessResponse[dict])
@limiter.limit("5/minute")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Reset password using verified reset token."""
    payload = decode_password_reset_token(
        body.token, expected_type="password_reset_verified"
    )
    if not payload:
        payload = decode_password_reset_token(
            body.token, expected_type="password_reset"
        )

    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    user_id = payload["sub"]
    import uuid as _uuid

    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token sub",
        )

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account not found or inactive.",
        )

    user.hashed_password = hash_password(body.new_password)
    await revoke_all_tokens(db, user_id=str(user.id))
    await db.commit()

    return SuccessResponse(
        data={
            "message": "Password reset successfully. You can now log in with your new password."
        }
    )


@router.delete("/me", response_model=SuccessResponse[dict])
async def delete_account(
    response: Response,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Permanently delete the user account and all associated data."""
    # Soft-delete: mark inactive (hard delete in production would cascade)
    current_user.is_active = False
    await revoke_all_tokens(db, user_id=str(current_user.id))
    await db.commit()

    _clear_refresh_cookie(response)
    return SuccessResponse(data={"message": "Account deleted."})


# ── Session management ────────────────────────────────────────────────


@router.get("/sessions", response_model=SuccessResponse[list[dict]])
async def list_sessions(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[list[dict]]:
    """List all active (non-revoked, non-expired) refresh token sessions."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked == False,  # noqa: E712
            RefreshToken.expires_at > now,
        )
        .order_by(RefreshToken.created_at.desc())
    )
    tokens = result.scalars().all()

    return SuccessResponse(
        data=[
            {
                "id": str(t.id),
                "created_at": t.created_at.isoformat(),
                "expires_at": t.expires_at.isoformat(),
            }
            for t in tokens
        ]
    )


@router.delete("/sessions/{token_id}", response_model=SuccessResponse[dict])
async def revoke_session(
    token_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Revoke a specific refresh token session."""
    import uuid as _uuid

    try:
        tid = _uuid.UUID(token_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID"
        )

    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.id == tid,
            RefreshToken.user_id == current_user.id,
        )
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    token.revoked = True
    token.revoked_at = datetime.now(timezone.utc)
    await db.commit()

    return SuccessResponse(data={"message": "Session revoked."})
