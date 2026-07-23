# app/alerts/router.py
# AlgoFin v2 — Phase E: Alerts REST API
#
# Telegram Config:
#   PUT  /alerts/telegram          — save / update config + send test message
#   GET  /alerts/telegram          — get config (bot_token masked)
#   DELETE /alerts/telegram        — delete config
#
# Alert Rules:
#   GET  /alerts/rules             — list user's rules
#   POST /alerts/rules             — create rule
#   PATCH /alerts/rules/{id}       — toggle is_active
#   DELETE /alerts/rules/{id}      — delete rule
#
# Delivery log:
#   GET  /alerts/history           — last N deliveries


from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, desc

from app.alerts.schemas import (
    AlertDeliveryResponse,
    AlertRuleCreate,
    AlertRuleResponse,
    TelegramConfigCreate,
    TelegramConfigResponse,
)
from app.alerts.telegram import validate_telegram_config
from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.common.security import decrypt_credential, encrypt_credential
from app.models.alert import AlertDelivery, AlertRule, TelegramConfig

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ── Helper ─────────────────────────────────────────────────────────────────


def _mask_token(token: str) -> str:
    """Return first 10 chars + *** + last 5."""
    if len(token) <= 15:
        return token[:4] + "***"
    return token[:10] + "***" + token[-5:]


def _config_response(cfg: TelegramConfig, raw_token: str) -> TelegramConfigResponse:
    return TelegramConfigResponse(
        id=str(cfg.id),
        chat_id=cfg.chat_id,
        bot_token_masked=_mask_token(raw_token),
        is_active=cfg.is_active,
        created_at=cfg.created_at.isoformat(),
    )


# ── Telegram Config endpoints ──────────────────────────────────────────────


@router.put("/telegram", response_model=SuccessResponse[TelegramConfigResponse])
async def upsert_telegram_config(
    body: TelegramConfigCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[TelegramConfigResponse]:
    """
    Save (or update) the user's Telegram bot config.
    Validates by sending a test message before saving.
    """
    # Validate the token + chat_id by test-messaging
    ok, err = await validate_telegram_config(
        body.bot_token.strip(), body.chat_id.strip()
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err or "Could not validate Telegram config",
        )

    encrypted = encrypt_credential(body.bot_token.strip())

    # Upsert
    result = await db.execute(
        select(TelegramConfig).where(TelegramConfig.user_id == str(current_user.id))
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.chat_id = body.chat_id.strip()
        cfg.bot_token_encrypted = encrypted
        cfg.is_active = True
    else:
        cfg = TelegramConfig(
            user_id=str(current_user.id),
            chat_id=body.chat_id.strip(),
            bot_token_encrypted=encrypted,
        )
        db.add(cfg)

    await db.commit()
    await db.refresh(cfg)

    return SuccessResponse(data=_config_response(cfg, body.bot_token.strip()))


@router.get("/telegram", response_model=SuccessResponse[TelegramConfigResponse | None])
async def get_telegram_config(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(TelegramConfig).where(TelegramConfig.user_id == str(current_user.id))
    )
    cfg = result.scalar_one_or_none()
    if not cfg:
        return SuccessResponse(data=None)
    raw_token = decrypt_credential(cfg.bot_token_encrypted)
    return SuccessResponse(data=_config_response(cfg, raw_token))


@router.delete("/telegram", response_model=SuccessResponse[dict])
async def delete_telegram_config(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(TelegramConfig).where(TelegramConfig.user_id == str(current_user.id))
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        await db.delete(cfg)
        await db.commit()
    return SuccessResponse(data={"deleted": True})


# ── Alert Rules endpoints ──────────────────────────────────────────────────


@router.get("/rules", response_model=SuccessResponse[list[AlertRuleResponse]])
async def list_rules(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.user_id == str(current_user.id))
        .order_by(AlertRule.created_at)
    )
    rules = result.scalars().all()
    return SuccessResponse(data=[AlertRuleResponse.from_orm_obj(r) for r in rules])


@router.post(
    "/rules", response_model=SuccessResponse[AlertRuleResponse], status_code=201
)
async def create_rule(
    body: AlertRuleCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    rule = AlertRule(
        user_id=str(current_user.id),
        alert_type=body.alert_type,
        symbol=body.symbol,
        threshold=body.threshold,
        direction=body.direction,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return SuccessResponse(data=AlertRuleResponse.from_orm_obj(rule))


@router.patch("/rules/{rule_id}", response_model=SuccessResponse[AlertRuleResponse])
async def toggle_rule(
    rule_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(AlertRule).where(
            AlertRule.id == rule_id,
            AlertRule.user_id == str(current_user.id),
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    rule.is_active = not rule.is_active
    await db.commit()
    await db.refresh(rule)
    return SuccessResponse(data=AlertRuleResponse.from_orm_obj(rule))


@router.delete("/rules/{rule_id}", response_model=SuccessResponse[dict])
async def delete_rule(
    rule_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(AlertRule).where(
            AlertRule.id == rule_id,
            AlertRule.user_id == str(current_user.id),
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    await db.delete(rule)
    await db.commit()
    return SuccessResponse(data={"deleted": True})


# ── Delivery history ───────────────────────────────────────────────────────


@router.get("/history", response_model=SuccessResponse[list[AlertDeliveryResponse]])
async def get_history(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = 50,
) -> SuccessResponse:
    limit = min(limit, 200)
    result = await db.execute(
        select(AlertDelivery)
        .where(AlertDelivery.user_id == str(current_user.id))
        .order_by(desc(AlertDelivery.sent_at))
        .limit(limit)
    )
    deliveries = result.scalars().all()
    return SuccessResponse(
        data=[AlertDeliveryResponse.from_orm_obj(d) for d in deliveries]
    )
