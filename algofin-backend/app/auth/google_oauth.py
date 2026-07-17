# app/auth/google_oauth.py
# AlgoFin v1 — Google OAuth 2.0 (PKCE-less server-side flow)
#
# Flow:
#   1. GET /auth/google           → redirect to Google's consent screen
#   2. GET /auth/google/callback  → Google redirects here with ?code=...
#      → exchange code for id_token → verify → upsert user → issue JWT
#      → redirect to frontend /auth/google/success?token=<access_token>

import secrets
import urllib.parse
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.auth.service import issue_tokens
from app.common.deps import DbSession
from app.config import settings
from app.models.user import User

router = APIRouter(prefix="/auth/google", tags=["auth"])

GOOGLE_AUTH_URL   = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL  = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO   = "https://www.googleapis.com/oauth2/v3/userinfo"

# In-memory state store (dev-only; production should use Redis)
_pending_states: dict[str, float] = {}


@router.get("")          # matches /api/v1/auth/google  (no trailing slash)
@router.get("/")         # matches /api/v1/auth/google/ (with trailing slash)
async def google_login() -> RedirectResponse:
    """
    Step 1: Redirect browser to Google consent screen.
    The frontend calls this by navigating to /api/v1/auth/google.
    """
    if not settings.google_client_id:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env",
        )

    state = secrets.token_urlsafe(32)
    _pending_states[state] = datetime.now(timezone.utc).timestamp()

    params = {
        "client_id":     settings.google_client_id,
        "redirect_uri":  settings.google_redirect_uri,
        "response_type": "code",
        "scope":         "openid email profile",
        "state":         state,
        "access_type":   "offline",
        "prompt":        "select_account",
    }
    url = f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=url)


@router.get("/callback")
async def google_callback(
    db: DbSession,
    request: Request,
    code:  str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    """
    Step 2: Google redirects here with ?code=...&state=...
    OR with ?error=access_denied (user denied / consent error).
    Exchange code → tokens → verify user → issue AlgoFin JWT.
    """
    # Fail gracefully on OAuth errors (user denied access, etc.)
    if error:
        return RedirectResponse(url=f"http://localhost:3000/login?error={urllib.parse.quote(error)}")

    # Missing code means something went wrong with the flow
    if not code or not state:
        return RedirectResponse(url="http://localhost:3000/login?error=missing_params")

    # Validate state (CSRF protection)
    now_ts = datetime.now(timezone.utc).timestamp()
    stored_ts = _pending_states.pop(state, None)
    if stored_ts is None or (now_ts - stored_ts) > 300:  # 5 min expiry
        return RedirectResponse(url="http://localhost:3000/login?error=invalid_state")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code":          code,
                "client_id":     settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri":  settings.google_redirect_uri,
                "grant_type":    "authorization_code",
            },
        )

    if token_resp.status_code != 200:
        return RedirectResponse(url="http://localhost:3000/login?error=token_exchange_failed")

    token_data = token_resp.json()
    access_token_google = token_data.get("access_token")

    # Fetch user info from Google
    async with httpx.AsyncClient() as client:
        info_resp = await client.get(
            GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {access_token_google}"},
        )

    if info_resp.status_code != 200:
        return RedirectResponse(url="http://localhost:3000/login?error=userinfo_failed")

    info = info_resp.json()
    google_id  = info.get("sub")
    email      = info.get("email", "").lower().strip()
    full_name  = info.get("name", email.split("@")[0])
    avatar_url = info.get("picture")

    if not google_id or not email:
        return RedirectResponse(url="http://localhost:3000/login?error=missing_user_info")

    # Upsert user: find by google_id OR email
    result = await db.execute(
        select(User).where(User.google_id == google_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        # Check if they registered with email/password first
        result2 = await db.execute(select(User).where(User.email == email))
        user = result2.scalar_one_or_none()

        if user:
            # Link Google ID to existing account
            user.google_id  = google_id
            user.avatar_url = avatar_url
        else:
            # Brand new user via Google
            user = User(
                email=email,
                hashed_password=None,  # OAuth-only account
                full_name=full_name,
                google_id=google_id,
                avatar_url=avatar_url,
                role="user",
                is_active=True,
            )
            db.add(user)

    await db.commit()
    await db.refresh(user)

    # Issue AlgoFin JWT pair
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    algofin_access_token, refresh_raw = await issue_tokens(
        db, user=user, ip_address=ip, user_agent=ua
    )

    # We use a tiny HTML bridge page to:
    #   1. Write the access token + user to Zustand's localStorage key
    #   2. Redirect to /dashboard
    # This is necessary because:
    #   - We can't set localStorage from a plain HTTP redirect
    #   - The httpOnly refresh cookie is set via response headers below
    import json
    user_json = json.dumps({
        "id":         str(user.id),
        "email":      user.email,
        "full_name":  user.full_name,
        "role":       user.role,
        "created_at": user.created_at.isoformat(),
        "google_id":  user.google_id,
        "avatar_url": user.avatar_url,
    })
    token_json = json.dumps(algofin_access_token)

    html = f"""<!DOCTYPE html>
<html>
<head><title>Signing you in…</title></head>
<body>
<script>
  try {{
    var stored = localStorage.getItem('algofin-auth');
    var parsed = stored ? JSON.parse(stored) : {{}};
    parsed.state = {{
      accessToken:     {token_json},
      user:            {user_json},
      isAuthenticated: true
    }};
    localStorage.setItem('algofin-auth', JSON.stringify(parsed));
  }} catch(e) {{ console.error('AlgoFin OAuth bridge error:', e); }}
  window.location.replace('/dashboard');
</script>
<p>Signing you in…</p>
</body>
</html>"""

    from starlette.responses import HTMLResponse as SR
    from datetime import timedelta
    from app.config import settings as cfg

    response = SR(content=html, status_code=200)
    # Set httpOnly refresh cookie (same as regular login)
    max_age = int(timedelta(days=cfg.jwt_refresh_expire_days).total_seconds())
    response.set_cookie(
        key="algofin_refresh_token",
        value=refresh_raw,
        httponly=True,
        secure=cfg.environment != "development",
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    return response
