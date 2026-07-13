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
app.include_router(marketdata_router, prefix=API_PREFIX)  # v2: real-time WS

# ── Health check ──────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok", "version": "2.0.0"}


# ── Startup event ─────────────────────────────────────────────────
@app.on_event("startup")
async def startup() -> None:
    logger.info("AlgoFin API starting up...")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"CORS origins: {settings.cors_origins}")

    # v2: start real-time Binance WebSocket stream
    try:
        from app.database import get_redis_client
        from app.marketdata.binance_stream import start_binance_stream
        redis = await get_redis_client()
        await start_binance_stream(redis)
        logger.info("[MarketData] Binance stream started.")
    except Exception as exc:
        logger.warning(f"[MarketData] Binance stream could not start: {exc} (no positions yet or Redis unavailable)")


# ── Shutdown event ─────────────────────────────────────────────────
@app.on_event("shutdown")
async def shutdown() -> None:
    from app.database import close_redis_client
    from app.marketdata.binance_stream import stop_binance_stream
    await stop_binance_stream()
    await close_redis_client()
    logger.info("AlgoFin API shut down cleanly.")
