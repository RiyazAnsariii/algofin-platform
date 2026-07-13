# app/exchanges/service.py
# AlgoFin v1 — Exchange account business logic

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.security import decrypt_credential, encrypt_credential
from app.models.exchange import (
    EncryptedApiCredential,
    ExchangeBillingConsent,
    ExchangeSyncRun,
    UserExchangeAccount,
)
from app.models.user import User


async def connect_exchange(
    db: AsyncSession,
    *,
    user: User,
    exchange_id: str,
    label: str,
    api_key: str,
    api_secret: str,
    passphrase: str | None,
    billing_consent: bool,
    consent_version: str,
    consent_text: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> UserExchangeAccount:
    """
    Connect a new exchange account.
    1. Create user_exchange_accounts row
    2. Encrypt and store API credentials
    3. Write billing consent (dual-record rule):
       - Update user_exchange_accounts.billing_consent
       - Append row to exchange_billing_consents
    All in one transaction.
    plan.md Section 9.
    """
    now = datetime.now(timezone.utc)

    account = UserExchangeAccount(
        user_id=user.id,
        exchange_id=exchange_id,
        label=label,
        sync_status="pending",
        billing_consent=billing_consent,
        billing_consent_at=now if billing_consent else None,
    )
    db.add(account)
    await db.flush()  # get account.id

    # Encrypt API credentials (never stored in plaintext)
    cred = EncryptedApiCredential(
        exchange_account_id=account.id,
        encrypted_api_key=encrypt_credential(api_key),
        encrypted_api_secret=encrypt_credential(api_secret),
        encrypted_passphrase=encrypt_credential(passphrase) if passphrase else None,
    )
    db.add(cred)

    # Billing consent audit trail (append-only, plan.md Section 3)
    consent_record = ExchangeBillingConsent(
        user_id=user.id,
        exchange_account_id=account.id,
        consent_granted=billing_consent,
        consent_version=consent_version,
        consented_at=now,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(consent_record)

    await db.commit()
    await db.refresh(account)
    return account


async def get_user_exchange_accounts(
    db: AsyncSession, *, user_id: str
) -> list[UserExchangeAccount]:
    result = await db.execute(
        select(UserExchangeAccount)
        .where(
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
        .order_by(UserExchangeAccount.created_at)
    )
    return list(result.scalars().all())


async def revoke_exchange_account(
    db: AsyncSession,
    *,
    account_id: str,
    user: User,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> bool:
    """
    Soft-delete exchange account and revoke billing consent.
    Returns True if found and revoked, False if not found.
    """
    result = await db.execute(
        select(UserExchangeAccount).where(
            UserExchangeAccount.id == account_id,
            UserExchangeAccount.user_id == user.id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        return False

    now = datetime.now(timezone.utc)
    account.is_active = False
    account.sync_status = "pending"

    # If account had billing consent, revoke it (dual-record rule)
    if account.billing_consent:
        account.billing_consent = False
        account.billing_consent_at = now

        revoke_record = ExchangeBillingConsent(
            user_id=user.id,
            exchange_account_id=account.id,
            consent_granted=False,
            consent_version="v1.0",
            consented_at=now,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(revoke_record)

    await db.commit()
    return True


async def get_decrypted_credentials(
    db: AsyncSession, *, exchange_account_id: str
) -> dict[str, str | None]:
    """
    Decrypt and return API credentials for use in sync jobs.
    ONLY called from backend sync workers — never from API routes.
    plan.md Section 4.
    """
    result = await db.execute(
        select(EncryptedApiCredential).where(
            EncryptedApiCredential.exchange_account_id == exchange_account_id
        )
    )
    cred = result.scalar_one_or_none()
    if cred is None:
        return {}

    return {
        "api_key":    decrypt_credential(cred.encrypted_api_key),
        "api_secret": decrypt_credential(cred.encrypted_api_secret),
        "passphrase": decrypt_credential(cred.encrypted_passphrase) if cred.encrypted_passphrase else None,
    }
