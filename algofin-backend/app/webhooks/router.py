# app/webhooks/router.py
# AlgoFin v2 — Phase M: Webhook router
#
# Endpoints:
#   POST /webhooks/tv/{strategy_id}         — TradingView webhook receiver (Phase M)
#   POST /webhooks/tv/{strategy_id}?test=1  — Test mode (logs but never executes)
#   POST /webhooks/inf/{strategy_id}        — Influencer strategy webhook (Phase INF)
#   GET  /webhooks/health                   — Queue + worker health (authenticated)
#
# Architecture rules enforced here:
#   - No business logic in this file (all delegated to WebhookService)
#   - Content-Length checked BEFORE JSON parsing (10 KB limit)
#   - ALWAYS returns HTTP 200 (TradingView retries on non-200)
#   - Sender IP extracted from X-Forwarded-For (Render proxies requests)

import uuid
import logging

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse

from app.common.deps import CurrentUser, DbSession
from app.config import settings
from app.database import get_redis_client
from app.adapters.tv_signal_source import TradingViewSignalSource
from app.webhooks.webhook_service import WebhookService
from app.webhooks.schemas import WebhookResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Singleton adapter (stateless — safe to share across requests)
_tv_source = TradingViewSignalSource()


def _get_sender_ip(request: Request) -> str | None:
    """
    Extracts real sender IP.
    Render (and most proxies) set X-Forwarded-For: <client_ip>, <proxy_ip>
    We take the first IP (the original client).
    """
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


# ── TradingView Webhook Receiver ─────────────────────────────────────────────


@router.post(
    "/tv/{strategy_id}",
    response_model=WebhookResponse,
    # IMPORTANT: status_code is intentionally NOT set here.
    # We always return 200 via JSONResponse — see note below.
    summary="TradingView webhook receiver",
    description=(
        "Receives signals from TradingView Pine Script alerts. "
        "Always returns HTTP 200 — TradingView retries on non-200 responses.\n\n"
        "**Authentication**: per-strategy secret in payload body (bcrypt verified).\n\n"
        "**Test mode**: append `?test=1` to log the signal without executing an order."
    ),
)
async def tradingview_webhook(
    strategy_id: uuid.UUID,
    request: Request,
    db: DbSession,
    is_test: bool = Query(default=False, alias="test"),
) -> JSONResponse:
    """
    TradingView webhook endpoint.

    Security layers (in order):
    1. Content-Length check (< 10 KB) — before JSON parse
    2. IP allowlist — TradingView's 4 known server IPs (bypassed in dev)
    3. Brute-force tracking — 5 failures/60s → block
    4. Rate limit — 100 signals/min per strategy
    5. Strategy existence check — generic "invalid" (no existence leakage)
    6. bcrypt secret verification (~80ms)
    7. Replay detection (signal age > 60s → reject)
    8. Idempotency (Redis SETNX + DB UNIQUE constraint)
    """
    # ── Content-Length guard (before JSON parse) ─────────────────────────────
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.webhook_payload_max_bytes:
        logger.warning(
            "Webhook rejected: payload too large",
            extra={
                "strategy_id": str(strategy_id),
                "content_length": content_length,
            },
        )
        # Return 200 with "invalid" — not 413 (TradingView would retry 413)
        return JSONResponse(status_code=200, content={"status": "invalid"})

    # ── Parse JSON body ───────────────────────────────────────────────────────
    try:
        raw_payload = await request.json()
        if not isinstance(raw_payload, dict):
            return JSONResponse(status_code=200, content={"status": "invalid"})
    except Exception:
        return JSONResponse(status_code=200, content={"status": "invalid"})

    # ── Extract sender IP ─────────────────────────────────────────────────────
    sender_ip = _get_sender_ip(request)

    # ── Delegate to WebhookService ────────────────────────────────────────────
    try:
        redis = await get_redis_client()
    except Exception:
        redis = None  # Redis unavailable: WebhookService will fail-open

    svc = WebhookService(db=db, redis=redis, signal_source=_tv_source)
    result = await svc.receive(
        strategy_id=strategy_id,
        raw_payload=raw_payload,
        sender_ip=sender_ip,
        is_test=is_test,
    )

    # Always HTTP 200 — TradingView must receive 200 or it retries
    return JSONResponse(status_code=200, content=result)


# ── Influencer Webhook Receiver (Phase INF) ───────────────────────────────────


@router.post(
    "/inf/{strategy_id}",
    summary="Influencer strategy webhook receiver",
    description=(
        "Receives signals from TradingView Pine Script alerts for influencer strategies.\n\n"
        "Always returns HTTP 200 — TradingView retries on non-200 responses.\n\n"
        "**Authentication**: per-strategy secret in payload body (bcrypt verified).\n\n"
        "**Signal actions**: ENTER_LONG | EXIT_LONG | ENTER_SHORT | EXIT_SHORT"
    ),
)
async def influencer_webhook(
    strategy_id: str,
    request: Request,
    db: DbSession,
) -> JSONResponse:
    """
    Influencer strategy webhook endpoint.

    Security layers (in order):
    1. Content-Length check (< 10 KB) — before JSON parse
    2. IP allowlist — TradingView's 4 known server IPs
    3. Rate limit — 100 signals/min per strategy (Redis)
    4. Strategy active check
    5. bcrypt secret verification
    6. Action validation (ENTER_LONG / EXIT_LONG / ENTER_SHORT / EXIT_SHORT)
    7. Replay detection (tv_timestamp age)
    8. Idempotency (Redis SETNX + DB UNIQUE constraint)

    Always HTTP 200 — errors returned as {"status": "rejected"|"error", "reason": "..."}
    """
    # ── Content-Length guard ──────────────────────────────────────────────────
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.webhook_payload_max_bytes:
        logger.warning(f"[InfWebhook] Payload too large for strategy {strategy_id}")
        return JSONResponse(status_code=200, content={"status": "invalid"})

    # ── Parse JSON body ───────────────────────────────────────────────────────
    try:
        raw_payload = await request.json()
        if not isinstance(raw_payload, dict):
            return JSONResponse(status_code=200, content={"status": "invalid"})
    except Exception:
        return JSONResponse(status_code=200, content={"status": "invalid"})

    # ── Extract sender IP ─────────────────────────────────────────────────────
    sender_ip = _get_sender_ip(request)

    # ── Delegate to InfluencerSignalService ───────────────────────────────────
    try:
        redis = await get_redis_client()
    except Exception:
        redis = None

    try:
        from app.influencer.signal_service import receive as inf_receive
        result = await inf_receive(
            strategy_id=strategy_id,
            raw_payload=raw_payload,
            sender_ip=sender_ip,
            db=db,
            redis=redis,
        )
    except Exception as exc:
        logger.exception(f"[InfWebhook] Unhandled error for strategy {strategy_id}: {exc}")
        result = {"status": "error"}

    # Always HTTP 200
    return JSONResponse(status_code=200, content=result)



# ── Webhook Health (authenticated) ───────────────────────────────────────────


@router.get(
    "/health",
    summary="Webhook engine health",
    description="Returns queue depth, DLQ depth, and worker heartbeat age. Requires authentication.",
)
async def webhook_health(current_user: CurrentUser) -> dict:
    """
    Returns operational health of the webhook engine.
    Used by the admin dashboard and monitoring.
    """
    try:
        from app.adapters.redis_queue import RedisQueueAdapter

        redis = await get_redis_client()
        q = RedisQueueAdapter(redis)

        queue_depth = await q.queue_depth()
        dlq_depth = await q.dlq_depth()
        heartbeat_age = await q.get_heartbeat_age_seconds()

        worker_status = "unknown"
        if heartbeat_age is None:
            worker_status = "dead"
        elif heartbeat_age < 30:
            worker_status = "healthy"
        elif heartbeat_age < 120:
            worker_status = "slow"
        else:
            worker_status = "dead"

        return {
            "queue_depth": queue_depth,
            "dlq_depth": dlq_depth,
            "worker": {
                "status": worker_status,
                "heartbeat_age_seconds": round(heartbeat_age, 1)
                if heartbeat_age
                else None,
            },
            "alerts": {
                "queue_depth_critical": queue_depth > 50,
                "dlq_has_items": dlq_depth > 0,
                "worker_dead": worker_status == "dead",
            },
        }
    except Exception as exc:
        logger.error(f"Webhook health check failed: {exc}")
        return {
            "queue_depth": -1,
            "dlq_depth": -1,
            "worker": {"status": "unknown", "heartbeat_age_seconds": None},
            "alerts": {
                "queue_depth_critical": False,
                "dlq_has_items": False,
                "worker_dead": True,
            },
        }
