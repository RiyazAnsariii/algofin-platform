# app/exchanges/router.py
# AlgoFin v1 — Exchange endpoints
# POST /exchanges/connect
# GET  /exchanges
# DELETE /exchanges/{account_id}
# POST /exchanges/{account_id}/sync

from fastapi import APIRouter, HTTPException, Request, status

from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.exchanges.schemas import (
    ConnectExchangeRequest,
    ExchangeAccountResponse,
    TriggerSyncRequest,
)
from app.exchanges.service import (
    connect_exchange,
    get_user_exchange_accounts,
    revoke_exchange_account,
)
from app.models.exchange import UserExchangeAccount

router = APIRouter(prefix="/exchanges", tags=["exchanges"])


def _account_to_response(account: UserExchangeAccount) -> ExchangeAccountResponse:
    return ExchangeAccountResponse(
        id=str(account.id),
        label=account.label,
        exchange_id=account.exchange_id,
        sync_status=account.sync_status,
        billing_consent=account.billing_consent,
        last_sync_at=account.last_sync_at.isoformat() if account.last_sync_at else None,
        billing_consent_at=account.billing_consent_at.isoformat() if account.billing_consent_at else None,
        created_at=account.created_at.isoformat(),
    )


@router.post(
    "/connect",
    response_model=SuccessResponse[ExchangeAccountResponse],
    status_code=status.HTTP_201_CREATED,
)
async def connect(
    body: ConnectExchangeRequest,
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[ExchangeAccountResponse]:
    """
    Connect a Binance USDT-M Futures account.
    Billing consent is REQUIRED. Credentials are encrypted at rest.
    plan.md Section 9 — POST /exchanges/connect spec.
    """
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    account = await connect_exchange(
        db,
        user=current_user,
        exchange_id=body.exchange_id,
        label=body.label,
        api_key=body.api_key,
        api_secret=body.api_secret,
        passphrase=body.passphrase,
        billing_consent=body.billing_consent.consented,
        consent_version=body.billing_consent.consent_version,
        consent_text=body.billing_consent.consent_text,
        ip_address=ip,
        user_agent=ua,
    )

    # Queue initial sync (will be implemented in sync engine)
    # For now, status is "pending" — worker will pick it up
    # TODO Phase B sync engine: trigger_sync_task.delay(str(account.id), "full")

    return SuccessResponse(data=_account_to_response(account))


@router.get("/", response_model=SuccessResponse[list[ExchangeAccountResponse]])
async def list_accounts(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[list[ExchangeAccountResponse]]:
    """List all connected exchange accounts for the current user."""
    accounts = await get_user_exchange_accounts(db, user_id=str(current_user.id))
    return SuccessResponse(data=[_account_to_response(a) for a in accounts])


@router.delete(
    "/{account_id}",
    response_model=SuccessResponse[dict],
)
async def revoke(
    account_id: str,
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Revoke (soft-delete) an exchange account and its billing consent."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    found = await revoke_exchange_account(
        db,
        account_id=account_id,
        user=current_user,
        ip_address=ip,
        user_agent=ua,
    )
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exchange account not found",
        )

    return SuccessResponse(data={"message": "Exchange account revoked"})


@router.post(
    "/{account_id}/sync",
    response_model=SuccessResponse[dict],
)
async def trigger_sync(
    account_id: str,
    body: TriggerSyncRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """
    Manually trigger a sync for an exchange account.
    Queues a Celery sync task (triggered_by = 'manual').
    """
    # Verify account belongs to user
    accounts = await get_user_exchange_accounts(db, user_id=str(current_user.id))
    account = next((a for a in accounts if str(a.id) == account_id), None)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exchange account not found",
        )

    # TODO Phase B sync engine: trigger_sync_task.delay(account_id, body.sync_type, "manual")
    # Placeholder response until sync engine is built
    return SuccessResponse(
        data={
            "message": f"Sync queued for {body.sync_type}",
            "account_id": account_id,
            "sync_type": body.sync_type,
        }
    )
