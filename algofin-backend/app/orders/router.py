# app/orders/router.py
# AlgoFin v2 — Phase B: Order management API endpoints
#
# POST   /orders          — place new order
# GET    /orders          — list orders (filter: symbol, status)
# GET    /orders/{id}     — get single order
# DELETE /orders/{id}     — cancel order
# PATCH  /orders/{id}     — amend order (price / quantity)

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.orders import service
from app.orders.schemas import AmendOrderRequest, OrderOut, PlaceOrderRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/orders", tags=["Orders"])


# ── POST /orders — Place order ────────────────────────────────────────────────
@router.post("", response_model=SuccessResponse[OrderOut], status_code=status.HTTP_201_CREATED)
async def place_order(
    req: PlaceOrderRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[OrderOut]:
    """
    Place a Binance USDT-M Futures order.
    Supported types: MARKET, LIMIT, STOP_MARKET, TAKE_PROFIT_MARKET.
    """
    try:
        order = await service.place_order(
            db,
            user_id=str(current_user.id),
            req=req,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this account")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid order request")
    except Exception as exc:
        logger.exception(f"Order placement failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Order could not be placed")

    return SuccessResponse(data=OrderOut.model_validate(order))


# ── GET /orders — List orders ─────────────────────────────────────────────────
@router.get("", response_model=SuccessResponse[list[OrderOut]])
async def list_orders(
    current_user: CurrentUser,
    db: DbSession,
    symbol: str | None = Query(None, description="Filter by symbol e.g. BTCUSDT"),
    order_status: str | None = Query(None, alias="status", description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
) -> SuccessResponse[list[OrderOut]]:
    """List orders placed through AlgoFin, most recent first."""
    orders = await service.list_orders(
        db,
        user_id=str(current_user.id),
        symbol=symbol,
        status=order_status,
        limit=limit,
    )
    return SuccessResponse(data=[OrderOut.model_validate(o) for o in orders])


# ── GET /orders/{id} — Get single order ──────────────────────────────────────
@router.get("/{order_id}", response_model=SuccessResponse[OrderOut])
async def get_order(
    order_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[OrderOut]:
    """Get a single order by AlgoFin order ID."""
    orders = await service.list_orders(
        db,
        user_id=str(current_user.id),
        limit=1,
    )
    # Filter inline (list_orders is the shared path; single-order fetch is low-volume)
    from sqlalchemy import select
    from app.models.exchange import UserExchangeAccount
    from app.models.order import Order as OrderModel

    result = await db.execute(
        select(OrderModel)
        .join(UserExchangeAccount, OrderModel.exchange_account_id == UserExchangeAccount.id)
        .where(
            OrderModel.id == str(order_id),
            UserExchangeAccount.user_id == str(current_user.id),
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return SuccessResponse(data=OrderOut.model_validate(order))


# ── DELETE /orders/{id} — Cancel order ───────────────────────────────────────
@router.delete("/{order_id}", response_model=SuccessResponse[OrderOut])
async def cancel_order(
    order_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[OrderOut]:
    """Cancel an open order."""
    try:
        order = await service.cancel_order(
            db,
            user_id=str(current_user.id),
            order_id=str(order_id),
        )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Not authorized for this order")
    except ValueError:
        raise HTTPException(status_code=400, detail="Order could not be cancelled")
    except Exception as exc:
        logger.exception(f"Order cancel failed: {exc}")
        raise HTTPException(status_code=500, detail="Order could not be cancelled")

    return SuccessResponse(data=OrderOut.model_validate(order))


# ── PATCH /orders/{id} — Amend order ─────────────────────────────────────────
@router.patch("/{order_id}", response_model=SuccessResponse[OrderOut])
async def amend_order(
    order_id: UUID,
    req: AmendOrderRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[OrderOut]:
    """Amend an open LIMIT order's price or quantity."""
    try:
        order = await service.amend_order(
            db,
            user_id=str(current_user.id),
            order_id=str(order_id),
            req=req,
        )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Not authorized for this order")
    except ValueError:
        raise HTTPException(status_code=400, detail="Order could not be amended")
    except Exception as exc:
        logger.exception(f"Order amend failed: {exc}")
        raise HTTPException(status_code=500, detail="Order could not be amended")

    return SuccessResponse(data=OrderOut.model_validate(order))
