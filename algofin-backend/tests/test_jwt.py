# tests/test_jwt.py
# AlgoFin — JWT and security utility tests
#
# Token architecture:
#   - Access tokens: short-lived JWTs signed with SECRET_KEY
#   - Refresh tokens: cryptographically random strings (NOT JWTs)
#     only the SHA-256 hash is stored in DB (httpOnly cookie to client)

from datetime import datetime, timezone
import pytest
from jose import jwt, JWTError

from app.common.security import (
    create_access_token,
    create_refresh_token_raw,
    hash_refresh_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.config import settings

ALGORITHM = settings.jwt_algorithm
SECRET    = settings.secret_key or "dev_secret_key_for_local_demo_only_32chars"


class TestAccessToken:
    def test_returns_string(self):
        token = create_access_token({"sub": "user-123"})
        assert isinstance(token, str) and len(token) > 0

    def test_contains_subject(self):
        token = create_access_token({"sub": "user-abc"})
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        assert payload["sub"] == "user-abc"

    def test_has_expiry_field(self):
        token = create_access_token({"sub": "user-123"})
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        assert "exp" in payload

    def test_type_field_is_access(self):
        """Tokens must carry type=access so they can't be used as refresh."""
        token = create_access_token({"sub": "user-123"})
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        assert payload.get("type") == "access"

    def test_tampered_token_rejected(self):
        token = create_access_token({"sub": "user-123"})
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(JWTError):
            jwt.decode(tampered, SECRET, algorithms=[ALGORITHM])

    def test_wrong_secret_rejected(self):
        token = create_access_token({"sub": "user-123"})
        with pytest.raises(JWTError):
            jwt.decode(token, "completely-wrong-secret", algorithms=[ALGORITHM])


class TestDecodeAccessToken:
    def test_valid_token_decoded(self):
        token = create_access_token({"sub": "user-123"})
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"

    def test_invalid_token_returns_none(self):
        assert decode_access_token("not.a.token") is None

    def test_empty_string_returns_none(self):
        assert decode_access_token("") is None


class TestRefreshToken:
    def test_raw_token_is_urlsafe_string(self):
        raw = create_refresh_token_raw()
        assert isinstance(raw, str)
        assert len(raw) >= 64   # token_urlsafe(64) → ~86 chars

    def test_two_raw_tokens_are_unique(self):
        assert create_refresh_token_raw() != create_refresh_token_raw()

    def test_hash_is_hex_string(self):
        raw = create_refresh_token_raw()
        h = hash_refresh_token(raw)
        assert isinstance(h, str)
        assert len(h) == 64   # SHA-256 hex = 64 chars

    def test_same_raw_always_produces_same_hash(self):
        raw = create_refresh_token_raw()
        assert hash_refresh_token(raw) == hash_refresh_token(raw)

    def test_different_raws_produce_different_hashes(self):
        assert hash_refresh_token("aaa") != hash_refresh_token("bbb")


class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        h = hash_password("StrongPass1!")
        assert h != "StrongPass1!"

    def test_verify_correct_password(self):
        h = hash_password("StrongPass1!")
        assert verify_password("StrongPass1!", h) is True

    def test_verify_wrong_password(self):
        h = hash_password("StrongPass1!")
        assert verify_password("WrongPass9!", h) is False

    def test_two_hashes_of_same_password_differ(self):
        """bcrypt uses a random salt — same password yields different hashes."""
        h1 = hash_password("StrongPass1!")
        h2 = hash_password("StrongPass1!")
        assert h1 != h2
