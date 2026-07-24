# app/common/cache_headers.py
# AlgoFin — HTTP Cache-Control middleware for API responses.
#
# Sets appropriate Cache-Control headers per endpoint pattern.
# Rules:
#   - All authenticated GET endpoints use `private` (never cache in shared CDN)
#   - POST/PATCH/PUT/DELETE and SSE/streaming responses always get `no-store`
#   - Static-ish data (e.g. supported exchanges) gets longer max-age
#   - Real-time data (positions, orders) gets short max-age

import re
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# ── Cache rules: (pattern, Cache-Control value) ──────────────────────────────
# Checked in order — first match wins. Patterns are matched against the URL path.
# Only applied to GET responses with 2xx status codes.

_CACHE_RULES: list[tuple[re.Pattern, str]] = [
    # Static registry data — cache aggressively
    (
        re.compile(r"/exchanges/supported$"),
        "private, max-age=300, stale-while-revalidate=600",
    ),
    # External data — moderate cache
    (
        re.compile(r"/events"),
        "private, max-age=120, stale-while-revalidate=600",
    ),
    # Historical / slow-changing analytics
    (
        re.compile(r"/journal/analytics"),
        "private, max-age=60, stale-while-revalidate=300",
    ),
    (
        re.compile(r"/billing/"),
        "private, max-age=60, stale-while-revalidate=300",
    ),
    # User-configured but not real-time
    (
        re.compile(r"/exchanges$"),
        "private, max-age=30, stale-while-revalidate=120",
    ),
    (
        re.compile(r"/journal/entries"),
        "private, max-age=30, stale-while-revalidate=120",
    ),
    (
        re.compile(r"/risk/"),
        "private, max-age=30, stale-while-revalidate=120",
    ),
    (
        re.compile(r"/alerts/"),
        "private, max-age=30, stale-while-revalidate=120",
    ),
    (
        re.compile(r"/strategy"),
        "private, max-age=30, stale-while-revalidate=120",
    ),
    (
        re.compile(r"/auth/sessions"),
        "private, max-age=30, stale-while-revalidate=120",
    ),
    # Portfolio / positions — need freshness
    (
        re.compile(r"/portfolio/"),
        "private, max-age=15, stale-while-revalidate=45",
    ),
    (
        re.compile(r"/positions"),
        "private, max-age=15, stale-while-revalidate=45",
    ),
    # Orders — most volatile
    (
        re.compile(r"/orders"),
        "private, max-age=10, stale-while-revalidate=30",
    ),
]

# Methods that should never be cached
_NO_CACHE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}


class CacheHeaderMiddleware:
    """
    ASGI middleware that injects Cache-Control headers on GET responses.

    - GET requests with 2xx status: matched against _CACHE_RULES
    - Non-GET or non-2xx: `Cache-Control: no-store`
    - SSE / streaming responses: `Cache-Control: no-cache` (already set by router)
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        path = scope.get("path", "/")

        # Skip non-GET requests — always no-store
        if method in _NO_CACHE_METHODS:
            async def send_no_store(message: Message) -> None:
                if message["type"] == "http.response.start":
                    headers = list(message.get("headers", []))
                    # Only add if not already set
                    if not any(h[0] == b"cache-control" for h in headers):
                        headers.append((b"cache-control", b"no-store"))
                        message = {**message, "headers": headers}
                await send(message)

            await self.app(scope, receive, send_no_store)
            return

        # GET requests — determine cache rule
        cache_value: str | None = None
        for pattern, value in _CACHE_RULES:
            if pattern.search(path):
                cache_value = value
                break

        if cache_value is None:
            # No matching rule — pass through without adding header
            await self.app(scope, receive, send)
            return

        async def send_with_cache(message: Message) -> None:
            if message["type"] == "http.response.start":
                status = message.get("status", 200)
                headers = list(message.get("headers", []))

                # Only cache 2xx responses
                if 200 <= status < 300:
                    # Don't overwrite existing Cache-Control (e.g. SSE no-cache)
                    if not any(h[0] == b"cache-control" for h in headers):
                        headers.append(
                            (b"cache-control", cache_value.encode())
                        )
                        message = {**message, "headers": headers}
                else:
                    # Non-2xx: no-store
                    if not any(h[0] == b"cache-control" for h in headers):
                        headers.append((b"cache-control", b"no-store"))
                        message = {**message, "headers": headers}

            await send(message)

        await self.app(scope, receive, send_with_cache)
