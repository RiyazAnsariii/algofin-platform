# app/common/security.py
# AlgoFin v1 — Security utilities
# - Password hashing (bcrypt)
# - JWT access + refresh token creation/verification
# - API key encryption/decryption (Fernet/AES-256)
# - Refresh token hash storage (never store raw tokens)

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.fernet import Fernet
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

# ── Password hashing ──────────────────────────────────────────────
# Using bcrypt directly — passlib has a known bug with bcrypt 4.x on Python 3.13
# (reads bcrypt.__about__ which was removed in bcrypt 4.0)
import bcrypt as _bcrypt


def hash_password(password: str) -> str:
    """Hash a password with bcrypt (12 rounds)."""
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────
def create_access_token(data: dict[str, Any]) -> str:
    """Create a short-lived JWT access token."""
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_expire_minutes
    )
    payload.update({"exp": expire, "type": "access"})
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token_raw() -> str:
    """
    Generate a cryptographically random refresh token.
    The raw value is sent to the client as an httpOnly cookie.
    Only the hash is stored in the database.
    """
    return secrets.token_urlsafe(64)


def hash_refresh_token(raw_token: str) -> str:
    """SHA-256 hash of a refresh token for DB storage."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def decode_access_token(token: str) -> dict[str, Any] | None:
    """
    Decode and verify a JWT access token.
    Returns payload dict or None if invalid/expired.
    """
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


# ── Fernet encryption for exchange API credentials ────────────────
def _get_fernet() -> Fernet:
    """Get configured Fernet cipher from settings."""
    if not settings.fernet_key:
        raise ValueError(
            "FERNET_KEY is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(settings.fernet_key.encode())


def encrypt_credential(plaintext: str) -> str:
    """Encrypt an API key/secret using Fernet (AES-256-CBC). Returns base64url string."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_credential(ciphertext: str) -> str:
    """Decrypt an encrypted credential. Raises if key is wrong or data is corrupt."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
