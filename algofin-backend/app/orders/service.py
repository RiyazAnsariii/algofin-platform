# app/orders/service.py
# AlgoFin v2 — Phase B: Order management business logic
#
# All operations are Binance USDT-M Futures ONLY.
# Uses CCXT (already in requirements) with the user's decrypted credentials.
# Credentials are decrypted inline — NEVER logged.

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import ccxt.async_support as ccxt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exchanges.service import get_decrypted_credentials
from app.models.exchange import UserExchangeAccount
from app.models.order import Order
from app.orders.schemas import AmendOrderRequest, PlaceOrderRequest

logger = logging.getLogger(__name__)

# ── CCXT client factory ───────────────────────────────────────────────────────

def _make_binance_client(api_key: str, api_secret: str) -> ccxt.binanceusdm:
    """
    Create an authenticated CCXT Binance USDT-M Futures client.
    options['defaultType'] = 'future' is required for USDT-M.
    """
    return ccxt.binanceusdm({
        "apiKey":  api_key,
        "secret":  api_secret,
        "options": {"defaultType": "future"},
        "enableRateLimit": True,
    })


# ── Authorization helper ──────────────────────────────────────────────────────

async def _get_authorized_account(
    db: AsyncSession,
    *,
    account_id: str,
    user_id: str,
) -> UserExchangeAccount | None:
    """Return the exchange account if it belongs to the user and is active."""
    result = await db.execute(
        select(UserExchangeAccount).where(
            UserExchangeAccount.id == account_id,
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    return result.scalar_one_or_none()


# ── Place order ───────────────────────────────────────────────────────────────

async def place_order(
    db: AsyncSession,
    *,
    user_id: str,
    req: PlaceOrderRequest,
) -> Order:
    """
    Place a Binance USDT-M Futures order.
    1. Verify account ownership
    2. Decrypt credentials
    3. Submit to Binance via CCXT
    4. Persist Order record (including errors)
    """
    account_id = str(req.exchange_account_id)

    # Step 1: Authorization
    account = await _get_authorized_account(db, account_id=account_id, user_id=user_id)
    if account is None:
        raise PermissionError("Exchange account not found or not authorized")

    # Step 2: Decrypt credentials
    creds = await get_decrypted_credentials(db, exchange_account_id=account_id)
    if not creds.get("api_key") or not creds.get("api_secret"):
        raise ValueError("Exchange account has no valid API credentials")

    # Step 3: Generate a unique client order ID for idempotency
    client_order_id = f"algofin_{uuid.uuid4().hex[:16]}"

    # Step 4: Build the Order record (persisted before exchange call for audit)
    order = Order(
        exchange_account_id=account_id,
        symbol=req.symbol.upper(),
        side=req.side,
        order_type=req.order_type,
        quantity=req.quantity,
        price=req.price,
        reduce_only=req.reduce_only,
        time_in_force=req.time_in_force,
        client_order_id=client_order_id,
        status="NEW",
    )
    db.add(order)
    await db.flush()  # get order.id before exchange call

    # Step 5: Submit to Binance
    client = _make_binance_client(creds["api_key"], creds["api_secret"])
    try:
        params: dict[str, Any] = {
            "newClientOrderId": client_order_id,
            "reduceOnly":       req.reduce_only,
        }
        if req.time_in_force and req.order_type == "LIMIT":
            params["timeInForce"] = req.time_in_force

        raw = await client.create_order(
            symbol=req.symbol.upper(),
            type=req.order_type.lower(),
            side=req.side.lower(),
            amount=float(req.quantity),
            price=float(req.price) if req.price else None,
            params=params,
        )
        # Map Binance response fields to our order
        order.binance_order_id = str(raw.get("id", ""))
        order.status = _map_status(raw.get("status", "NEW"))
        order.filled_quantity = Decimal(str(raw.get("filled", 0)))
        avg = raw.get("average")
        if avg:
            order.avg_fill_price = Decimal(str(avg))
        if order.status == "FILLED":
            order.filled_at = datetime.now(timezone.utc)

        logger.info(
            f"[Orders] Placed {req.order_type} {req.side} {req.symbol} "
            f"qty={req.quantity} → binance_id={order.binance_order_id}"
        )
    except ccxt.BaseError as exc:
        order.status = "REJECTED"
        order.error_message = str(exc)[:500]
        logger.warning(f"[Orders] Binance rejected order: {exc}")
    finally:
        await client.close()

    await db.commit()
    await db.refresh(order)
    return order


# ── Cancel order ──────────────────────────────────────────────────────────────

async def cancel_order(
    db: AsyncSession,
    *,
    user_id: str,
    order_id: str,
) -> Order:
    """Cancel an open order by AlgoFin order ID."""
    # Find the order and verify ownership via exchange_account
    result = await db.execute(
        select(Order)
        .join(UserExchangeAccount, Order.exchange_account_id == UserExchangeAccount.id)
        .where(
            Order.id == order_id,
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise PermissionError("Order not found or not authorized")
    if order.status not in ("NEW", "PARTIALLY_FILLED"):
        raise ValueError(f"Order cannot be cancelled in status: {order.status}")

    creds = await get_decrypted_credentials(db, exchange_account_id=str(order.exchange_account_id))
    client = _make_binance_client(creds["api_key"], creds["api_secret"])
    try:
        await client.cancel_order(
            id=order.binance_order_id,
            symbol=order.symbol,
        )
        order.status = "CANCELLED"
        order.cancelled_at = datetime.now(timezone.utc)
        logger.info(f"[Orders] Cancelled order {order.id} ({order.binance_order_id})")
    except ccxt.BaseError as exc:
        order.error_message = str(exc)[:500]
        logger.warning(f"[Orders] Cancel failed: {exc}")
        raise ValueError(f"Binance cancel failed: {exc}") from exc
    finally:
        await client.close()

    await db.commit()
    await db.refresh(order)
    return order


# ── Amend order ───────────────────────────────────────────────────────────────

async def amend_order(
    db: AsyncSession,
    *,
    user_id: str,
    order_id: str,
    req: AmendOrderRequest,
) -> Order:
    """
    Amend a LIMIT order's price and/or quantity.
    Binance USDT-M supports order amendment via PUT /fapi/v1/order.
    CCXT: edit_order()
    """
    result = await db.execute(
        select(Order)
        .join(UserExchangeAccount, Order.exchange_account_id == UserExchangeAccount.id)
        .where(
            Order.id == order_id,
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise PermissionError("Order not found or not authorized")
    if order.order_type != "LIMIT":
        raise ValueError("Only LIMIT orders can be amended")
    if order.status not in ("NEW", "PARTIALLY_FILLED"):
        raise ValueError(f"Order cannot be amended in status: {order.status}")

    creds = await get_decrypted_credentials(db, exchange_account_id=str(order.exchange_account_id))
    client = _make_binance_client(creds["api_key"], creds["api_secret"])
    try:
        new_price  = float(req.new_price)  if req.new_price    else float(order.price)
        new_amount = float(req.new_quantity) if req.new_quantity else float(order.quantity)

        raw = await client.edit_order(
            id=order.binance_order_id,
            symbol=order.symbol,
            type="limit",
            side=order.side.lower(),
            amount=new_amount,
            price=new_price,
        )
        if req.new_price:
            order.price = req.new_price
        if req.new_quantity:
            order.quantity = req.new_quantity
        order.status = _map_status(raw.get("status", order.status))
        logger.info(f"[Orders] Amended order {order.id}")
    except ccxt.BaseError as exc:
        order.error_message = str(exc)[:500]
        logger.warning(f"[Orders] Amend failed: {exc}")
        raise ValueError(f"Binance amend failed: {exc}") from exc
    finally:
        await client.close()

    await db.commit()
    await db.refresh(order)
    return order


# ── List orders ───────────────────────────────────────────────────────────────

async def list_orders(
    db: AsyncSession,
    *,
    user_id: str,
    symbol: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[Order]:
    """List orders for the current user, optionally filtered."""
    query = (
        select(Order)
        .join(UserExchangeAccount, Order.exchange_account_id == UserExchangeAccount.id)
        .where(
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
        .order_by(Order.placed_at.desc())
        .limit(limit)
    )
    if symbol:
        query = query.where(Order.symbol == symbol.upper())
    if status:
        query = query.where(Order.status == status.upper())

    result = await db.execute(query)
    return list(result.scalars().all())


# ── Status mapper ─────────────────────────────────────────────────────────────

def _map_status(binance_status: str) -> str:
    """Map Binance order status to our canonical status."""
    mapping = {
        "NEW":              "NEW",
        "PARTIALLY_FILLED": "PARTIALLY_FILLED",
        "FILLED":           "FILLED",
        "CANCELED":         "CANCELLED",   # Binance uses CANCELED (one L)
        "CANCELLED":        "CANCELLED",
        "EXPIRED":          "EXPIRED",
        "REJECTED":         "REJECTED",
    }
    return mapping.get(binance_status.upper(), binance_status.upper())
