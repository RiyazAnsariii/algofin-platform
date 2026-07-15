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


@router.get("/")
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
    code: str = Query(...),
    state: str = Query(...),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    """
    Step 2: Google redirects here with ?code=...&state=...
    Exchange code → tokens → verify user → issue AlgoFin JWT.
    """
    # Fail gracefully on OAuth errors (user denied access, etc.)
    if error:
        return RedirectResponse(url=f"http://localhost:3000/login?error={urllib.parse.quote(error)}")

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
    algofin_access_token, _refresh_raw = await issue_tokens(
        db, user=user, ip_address=ip, user_agent=ua
    )

    # Set refresh cookie and redirect to frontend success page
    from fastapi.responses import HTMLResponse

    # We use a tiny HTML page to set the access token in localStorage
    # and then redirect — needed because cookies set by backend won't be
    # accessible to frontend JS and localStorage can't be set from a redirect.
    html = f"""<!DOCTYPE html>
<html>
<head><title>Signing you in…</title></head>
<body>
<script>
  try {{
    var stored = localStorage.getItem('algofin-auth');
    var parsed = stored ? JSON.parse(stored) : {{}};
    if (!parsed.state) parsed.state = {{}};
    parsed.state.accessToken = {repr(algofin_access_token)};
    parsed.state.isAuthenticated = true;
    localStorage.setItem('algofin-auth', JSON.stringify(parsed));
  }} catch(e) {{}}
  window.location.replace('/dashboard');
</script>
<p>Signing you in…</p>
</body>
</html>"""

    from starlette.responses import HTMLResponse as SR
    return SR(content=html, status_code=200)
