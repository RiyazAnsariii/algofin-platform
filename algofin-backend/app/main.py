# app/main.py
# AlgoFin v1 — FastAPI application entry point

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.assistant.router import router as assistant_router
from app.billing.router import router as billing_router
from app.config import settings
from app.events.router import router as events_router
from app.exchanges.router import router as exchanges_router
from app.marketdata.ws_router import router as marketdata_router
from app.orders.router import router as orders_router  # v2 Phase B
from app.risk.router import router as risk_router      # v2 Phase D
from app.alerts.router import router as alerts_router  # v2 Phase E
from app.strategy.router import router as strategy_router  # v2 Phase F
from app.journal.router import router as journal_router    # v2 Phase G
from app.portfolio.router import router as portfolio_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Rate limiter ──────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ── FastAPI app ───────────────────────────────────────────────────
app = FastAPI(
    title="AlgoFin API",
    description=(
        "AlgoFin v2 — Portfolio-aware trading operating layer for Binance USDT-M Futures.\n\n"
        "Binance USDT-M Futures only. Real-time market data via WebSocket."
    ),
    version="2.0.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global exception handler ──────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(f"Unhandled exception on {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}},
    )

# ── Routers ───────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(auth_router,       prefix=API_PREFIX)
app.include_router(exchanges_router,  prefix=API_PREFIX)
app.include_router(portfolio_router,  prefix=API_PREFIX)
app.include_router(billing_router,    prefix=API_PREFIX)
app.include_router(events_router,     prefix=API_PREFIX)
app.include_router(assistant_router,  prefix=API_PREFIX)
app.include_router(admin_router,      prefix=API_PREFIX)
app.include_router(marketdata_router, prefix=API_PREFIX)  # v2 Phase A: real-time WS
app.include_router(orders_router,     prefix=API_PREFIX)  # v2 Phase B: order management
app.include_router(risk_router,       prefix=API_PREFIX)  # v2 Phase D: risk controls
app.include_router(alerts_router,     prefix=API_PREFIX)  # v2 Phase E: Telegram alerts
app.include_router(strategy_router,   prefix=API_PREFIX)  # v2 Phase F: strategy engine
app.include_router(journal_router,    prefix=API_PREFIX)  # v2 Phase G: journal & analytics

# ── Health check ──────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok", "version": "2.0.0"}


# ── Startup event ──────────────────────────────────────────
@app.on_event("startup")
async def startup() -> None:
    logger.info("AlgoFin API starting up...")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"CORS origins: {settings.cors_origins}")

    # v2 Phase A: start real-time Binance mark price stream
    try:
        from app.database import get_redis_client
        from app.marketdata.binance_stream import start_binance_stream
        redis = await get_redis_client()
        await start_binance_stream(redis)
        logger.info("[MarketData] Binance mark price stream started.")
    except Exception as exc:
        logger.warning(f"[MarketData] Mark price stream could not start: {exc}")

    # v2 Phase C: start Binance user data streams (order event streaming)
    try:
        from app.database import get_redis_client, AsyncSessionLocal
        from app.marketdata.binance_user_stream import start_all_user_streams
        redis = await get_redis_client()
        await start_all_user_streams(redis, AsyncSessionLocal)
        logger.info("[UserStream] User data streams started.")
    except Exception as exc:
        logger.warning(f"[UserStream] User streams could not start: {exc}")

    # v2 Phase E: start Telegram alert dispatcher
    try:
        from app.alerts.engine import start_alert_dispatcher
        start_alert_dispatcher()
        logger.info("[AlertEngine] Telegram alert dispatcher started.")
    except Exception as exc:
        logger.warning(f"[AlertEngine] Could not start dispatcher: {exc}")

    # v2 Phase F: start Strategy Engine
    try:
        from app.strategy.engine import start_strategy_engine
        start_strategy_engine()
        logger.info("[StrategyEngine] Strategy engine started.")
    except Exception as exc:
        logger.warning(f"[StrategyEngine] Could not start engine: {exc}")


# ── Shutdown event ──────────────────────────────────────────
@app.on_event("shutdown")
async def shutdown() -> None:
    from app.alerts.engine import stop_alert_dispatcher
    from app.strategy.engine import stop_strategy_engine
    from app.database import close_redis_client
    from app.marketdata.binance_stream import stop_binance_stream
    from app.marketdata.binance_user_stream import stop_all_user_streams
    stop_strategy_engine()           # v2 Phase F
    stop_alert_dispatcher()          # v2 Phase E
    await stop_all_user_streams()
    await stop_binance_stream()
    await close_redis_client()
    logger.info("AlgoFin API shut down cleanly.")
