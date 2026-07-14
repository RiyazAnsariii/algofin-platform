# app/alerts/telegram.py
# AlgoFin v2 — Phase E: Telegram Bot sender
#
# Sends a message to a Telegram chat using the Bot API.
# No third-party library needed — pure aiohttp/httpx against the Bot API.
#
# Bot API endpoint:
#   POST https://api.telegram.org/bot{TOKEN}/sendMessage
#
# Setup (user-facing):
#   1. Message @BotFather on Telegram → /newbot → get TOKEN
#   2. Start your bot, then GET https://api.telegram.org/bot{TOKEN}/getUpdates
#      to find your chat_id
#   3. Enter both in AlgoFin → Alerts settings

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org/bot"


async def send_telegram_message(
    bot_token: str,
    chat_id: str,
    text: str,
    parse_mode: str = "HTML",
    disable_notification: bool = False,
) -> bool:
    """
    Send a text message via the Telegram Bot API.
    Returns True on success, False on failure (logs the error).
    """
    url = f"{TELEGRAM_API_BASE}{bot_token}/sendMessage"
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
        "disable_notification": disable_notification,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200 and resp.json().get("ok"):
                return True
            else:
                logger.warning(
                    "[Telegram] Send failed: %s — %s",
                    resp.status_code,
                    resp.text[:200],
                )
                return False
    except httpx.TimeoutException:
        logger.error("[Telegram] Timeout sending to chat %s", chat_id)
        return False
    except Exception as exc:
        logger.error("[Telegram] Unexpected error: %s", exc)
        return False


async def validate_telegram_config(bot_token: str, chat_id: str) -> tuple[bool, str]:
    """
    Validate a bot token and chat ID by sending a test message.
    Returns (success, error_message).
    """
    test_text = (
        "<b>AlgoFin</b> — Telegram connected!\n\n"
        "You will now receive alerts for your configured events."
    )
    ok = await send_telegram_message(bot_token, chat_id, test_text)
    if ok:
        return True, ""

    # Try to get a better error message from the API
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{TELEGRAM_API_BASE}{bot_token}/getMe")
            if resp.status_code == 401:
                return False, "Invalid bot token. Check your token from @BotFather."
            if not resp.json().get("ok"):
                return False, "Telegram API error: " + resp.json().get("description", "unknown")
    except Exception:
        pass

    return False, "Could not reach Telegram. Check your bot token and chat ID."


# ── Message formatters ─────────────────────────────────────────────────────

def fmt_order_filled(symbol: str, side: str, qty: str, price: str | None) -> str:
    price_line = f"\nAvg Price: <code>${float(price):,.2f}</code>" if price else ""
    return (
        f"<b>Order Filled</b>\n\n"
        f"Symbol: <code>{symbol}</code>\n"
        f"Side: <b>{side}</b>\n"
        f"Quantity: <code>{qty}</code>"
        f"{price_line}"
    )


def fmt_order_cancelled(symbol: str, side: str, qty: str, reason: str | None) -> str:
    reason_line = f"\nReason: {reason}" if reason else ""
    return (
        f"<b>Order Cancelled</b>\n\n"
        f"Symbol: <code>{symbol}</code>\n"
        f"Side: <b>{side}</b>\n"
        f"Quantity: <code>{qty}</code>"
        f"{reason_line}"
    )


def fmt_order_rejected(symbol: str, side: str, qty: str, error: str | None) -> str:
    error_line = f"\nReason: {error}" if error else ""
    return (
        f"<b>Order Rejected</b>\n\n"
        f"Symbol: <code>{symbol}</code>\n"
        f"Side: <b>{side}</b>\n"
        f"Quantity: <code>{qty}</code>"
        f"{error_line}"
    )


def fmt_risk_triggered(rule_name: str, detail: str, action: str) -> str:
    action_emoji = "BLOCKED" if action == "reject" else "WARNING"
    return (
        f"<b>Risk Rule Triggered — {action_emoji}</b>\n\n"
        f"Rule: <b>{rule_name}</b>\n"
        f"{detail}"
    )


def fmt_price_alert(symbol: str, direction: str, threshold: str, current: str) -> str:
    arrow = "above" if direction == "above" else "below"
    return (
        f"<b>Price Alert</b>\n\n"
        f"<code>{symbol}</code> is now <b>{arrow}</b> your threshold\n"
        f"Threshold: <code>${float(threshold):,.2f}</code>\n"
        f"Current:   <code>${float(current):,.2f}</code>"
    )
