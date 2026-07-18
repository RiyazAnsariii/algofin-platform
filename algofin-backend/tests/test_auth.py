# tests/test_auth.py
# AlgoFin — authentication schema and signup/login validation tests

import pytest
from pydantic import ValidationError
from app.auth.schemas import SignupRequest


# ── SignupRequest schema validation ───────────────────────────────────────────

class TestSignupSchema:
    def test_valid_signup(self):
        """A strong password and valid email should pass."""
        req = SignupRequest(
            email="user@example.com",
            password="StrongPass1!",
            full_name="Test User",
        )
        assert req.email == "user@example.com"

    def test_password_too_short(self):
        with pytest.raises(ValidationError, match="at least 8 characters"):
            SignupRequest(email="a@b.com", password="Sh0rt!", full_name="A")

    def test_password_no_uppercase(self):
        with pytest.raises(ValidationError, match="uppercase"):
            SignupRequest(email="a@b.com", password="nouppercase1!", full_name="A")

    def test_password_no_lowercase(self):
        with pytest.raises(ValidationError, match="lowercase"):
            SignupRequest(email="a@b.com", password="NOLOWER1!", full_name="A")

    def test_password_no_digit(self):
        with pytest.raises(ValidationError, match="digit"):
            SignupRequest(email="a@b.com", password="NoDigitHere!", full_name="A")

    def test_password_no_special(self):
        with pytest.raises(ValidationError, match="special character"):
            SignupRequest(email="a@b.com", password="NoSpecial1", full_name="A")

    def test_empty_full_name_rejected(self):
        with pytest.raises(ValidationError, match="full_name"):
            SignupRequest(email="a@b.com", password="StrongPass1!", full_name="   ")

    def test_invalid_email_rejected(self):
        with pytest.raises(ValidationError):
            SignupRequest(email="not-an-email", password="StrongPass1!", full_name="A")


# ── API signup validation (returns 422 on bad input) ─────────────────────────

@pytest.mark.asyncio
async def test_signup_missing_fields_returns_422(client):
    """POST /api/v1/auth/signup with no body must return 422."""
    r = await client.post("/api/v1/auth/signup", json={})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_signup_weak_password_returns_422(client):
    """POST /api/v1/auth/signup with a weak password must return 422."""
    r = await client.post("/api/v1/auth/signup", json={
        "email": "test@test.com",
        "password": "weak",
        "full_name": "Test",
    })
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_login_missing_fields_returns_422(client):
    """POST /api/v1/auth/login with no body must return 422."""
    r = await client.post("/api/v1/auth/login", json={})
    assert r.status_code == 422
