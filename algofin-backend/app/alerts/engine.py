# app/alerts/engine.py
# AlgoFin v2 — Phase E: Alert dispatcher
#
# Background asyncio task that:
#   1. Subscribes to Redis channels (order_events, risk_events, price_updates)
#   2. For each event, looks up users with matching active AlertRules + TelegramConfig
#   3. Sends Telegram message and logs the delivery in AlertDelivery
#
# Redis channels consumed:
#   algofin:order_events:{user_id}    — OrderEvent JSON
#   algofin:risk_events:{user_id}     — RiskEvent JSON
#   algofin:price_updates             — MarketDataEvent JSON (for PRICE_ALERT)

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.telegram import (
    fmt_order_cancelled,
    fmt_order_filled,
    fmt_order_rejected,
    fmt_price_alert,
    fmt_risk_triggered,
    send_telegram_message,
)
from app.common.security import decrypt_credential
from app.database import AsyncSessionLocal
from app.models.alert import AlertDelivery, AlertRule, TelegramConfig

logger = logging.getLogger(__name__)

_dispatcher_task: asyncio.Task | None = None


# ── DB helpers ─────────────────────────────────────────────────────────────

async def _get_telegram_config(db: AsyncSession, user_id: str) -> TelegramConfig | None:
    result = await db.execute(
        select(TelegramConfig).where(
            TelegramConfig.user_id == user_id,
            TelegramConfig.is_active == True,  # noqa: E712
        )
    )
    return result.scalar_one_or_none()


async def _get_active_rules(
    db: AsyncSession, user_id: str, alert_type: str
) -> list[AlertRule]:
    result = await db.execute(
        select(AlertRule).where(
            AlertRule.user_id == user_id,
            AlertRule.alert_type == alert_type,
            AlertRule.is_active == True,  # noqa: E712
        )
    )
    return list(result.scalars().all())


async def _send_and_log(
    db: AsyncSession,
    *,
    user_id: str,
    rule_id: str | None,
    event_type: str,
    message: str,
    bot_token: str,
    chat_id: str,
) -> None:
    ok = await send_telegram_message(bot_token, chat_id, message)
    delivery = AlertDelivery(
        user_id=user_id,
        rule_id=rule_id,
        event_type=event_type,
        message=message,
        success=ok,
    )
    db.add(delivery)

    if rule_id:
        # Update triggered_count on the rule
        r = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
        rule = r.scalar_one_or_none()
        if rule:
            rule.triggered_count += 1
            rule.last_triggered_at = datetime.now(timezone.utc)

    await db.commit()


# ── Event handlers ─────────────────────────────────────────────────────────

async def _handle_order_event(user_id: str, event: dict) -> None:
    status = event.get("status", "")
    type_map = {
        "FILLED":    "ORDER_FILLED",
        "CANCELLED": "ORDER_CANCELLED",
        "REJECTED":  "ORDER_REJECTED",
    }
    alert_type = type_map.get(status)
    if not alert_type:
        return

    async with AsyncSessionLocal() as db:
        tg = await _get_telegram_config(db, user_id)
        if not tg:
            return
        rules = await _get_active_rules(db, user_id, alert_type)
        if not rules:
            return

        symbol = event.get("symbol", "?")
        side   = event.get("side", "?")
        qty    = str(event.get("filled_quantity") or event.get("quantity", "?"))
        price  = str(event.get("avg_fill_price") or "")

        if alert_type == "ORDER_FILLED":
            msg = fmt_order_filled(symbol, side, qty, price or None)
        elif alert_type == "ORDER_CANCELLED":
            msg = fmt_order_cancelled(symbol, side, qty, event.get("error_message"))
        else:
            msg = fmt_order_rejected(symbol, side, qty, event.get("error_message"))

        bot_token = decrypt_credential(tg.bot_token_encrypted)
        for rule in rules:
            await _send_and_log(
                db,
                user_id=user_id,
                rule_id=str(rule.id),
                event_type=alert_type,
                message=msg,
                bot_token=bot_token,
                chat_id=tg.chat_id,
            )


async def _handle_risk_event(user_id: str, event: dict) -> None:
    async with AsyncSessionLocal() as db:
        tg = await _get_telegram_config(db, user_id)
        if not tg:
            return
        rules = await _get_active_rules(db, user_id, "RISK_TRIGGERED")
        if not rules:
            return

        rule_name = event.get("rule_name", "Unknown rule")
        action    = event.get("action", "alert")
        detail    = event.get("detail", "")
        msg       = fmt_risk_triggered(rule_name, detail, action)

        bot_token = decrypt_credential(tg.bot_token_encrypted)
        for rule in rules:
            await _send_and_log(
                db,
                user_id=user_id,
                rule_id=str(rule.id),
                event_type="RISK_TRIGGERED",
                message=msg,
                bot_token=bot_token,
                chat_id=tg.chat_id,
            )


async def _handle_price_update(event: dict) -> None:
    """
    Price alerts: compare incoming price against each active PRICE_ALERT rule.
    Simple edge-triggered: fires whenever the price crosses the threshold.
    (Debounce / cooldown can be added later via last_triggered_at.)
    """
    symbol       = event.get("symbol", "")
    current_str  = str(event.get("price") or event.get("mark_price") or "")
    if not symbol or not current_str:
        return

    try:
        current_price = float(current_str)
    except ValueError:
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AlertRule, TelegramConfig).join(
                TelegramConfig, TelegramConfig.user_id == AlertRule.user_id
            ).where(
                AlertRule.alert_type == "PRICE_ALERT",
                AlertRule.symbol == symbol,
                AlertRule.is_active == True,   # noqa: E712
                TelegramConfig.is_active == True,  # noqa: E712
            )
        )
        rows = result.all()
        if not rows:
            return

        for rule, tg in rows:
            if rule.threshold is None or rule.direction is None:
                continue
            threshold = float(rule.threshold)
            triggered = (
                (rule.direction == "above" and current_price >= threshold) or
                (rule.direction == "below" and current_price <= threshold)
            )
            if not triggered:
                continue

            msg       = fmt_price_alert(symbol, rule.direction, str(rule.threshold), current_str)
            bot_token = decrypt_credential(tg.bot_token_encrypted)
            await _send_and_log(
                db,
                user_id=rule.user_id,
                rule_id=str(rule.id),
                event_type="PRICE_ALERT",
                message=msg,
                bot_token=bot_token,
                chat_id=tg.chat_id,
            )


# ── Redis subscriber loop ──────────────────────────────────────────────────

async def _run_dispatcher() -> None:
    """
    Long-running background task.
    Pattern-subscribes to order_events and risk_events channels.
    """
    from app.database import get_redis_client as get_redis  # imported here to avoid circular

    logger.info("[AlertEngine] Starting dispatcher...")
    try:
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.psubscribe(
            "algofin:order_events:*",
            "algofin:risk_events:*",
            "algofin:price_updates",
        )
        logger.info("[AlertEngine] Subscribed to order_events, risk_events, price_updates")

        async for raw in pubsub.listen():
            if raw["type"] not in ("pmessage", "message"):
                continue
            try:
                channel = raw.get("channel") or ""
                if isinstance(channel, bytes):
                    channel = channel.decode()
                data = raw.get("data") or b""
                if isinstance(data, bytes):
                    data = data.decode()
                event = json.loads(data)

                if "order_events:" in channel:
                    user_id = channel.split(":")[-1]
                    await _handle_order_event(user_id, event)
                elif "risk_events:" in channel:
                    user_id = channel.split(":")[-1]
                    await _handle_risk_event(user_id, event)
                elif "price_updates" in channel:
                    await _handle_price_update(event)
            except Exception as exc:
                logger.error("[AlertEngine] Error processing event: %s", exc)
    except asyncio.CancelledError:
        logger.info("[AlertEngine] Dispatcher stopped.")
    except Exception as exc:
        return exc   # bubble up to the retry wrapper


async def _run_dispatcher_with_backoff() -> None:
    """
    Retry wrapper with exponential backoff.
    Upstash Redis (free tier) closes pub/sub connections immediately.
    After 5 consecutive failures we stop retrying to prevent log spam.
    The HTTP API continues to work regardless.
    """
    delay = 5
    max_delay = 60
    max_attempts = 5
    attempt = 0

    while attempt < max_attempts:
        exc = await _run_dispatcher()
        if exc is None:
            return   # clean shutdown
        attempt += 1
        logger.warning(
            "[AlertEngine] Connection failed (%s/%s): %s — retrying in %ss",
            attempt, max_attempts, exc, delay,
        )
        await asyncio.sleep(delay)
        delay = min(delay * 2, max_delay)

    logger.error(
        "[AlertEngine] Pub/sub unavailable after %s attempts. "
        "Upstash free tier does not support persistent pub/sub. "
        "Engine disabled — HTTP API unaffected.",
        max_attempts,
    )


def start_alert_dispatcher() -> None:
    """Called from app startup. Launches the dispatcher as a background task."""
    global _dispatcher_task
    _dispatcher_task = asyncio.ensure_future(_run_dispatcher_with_backoff())
    logger.info("[AlertEngine] Dispatcher task created.")


def stop_alert_dispatcher() -> None:
    """Called from app shutdown."""
    global _dispatcher_task
    if _dispatcher_task and not _dispatcher_task.done():
        _dispatcher_task.cancel()
        logger.info("[AlertEngine] Dispatcher task cancelled.")
