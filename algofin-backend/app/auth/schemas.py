# app/auth/schemas.py
# AlgoFin v1 — Auth request/response Pydantic schemas

from pydantic import BaseModel, EmailStr, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        if not any(c in "!@#$%^&*()_+-=[]{}|;':\",./<>?`~" for c in v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("full_name")
    @classmethod
    def full_name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name is required")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id:         str
    email:      str
    full_name:  str
    role:       str
    created_at: str
    # Google OAuth fields
    google_id:  str | None = None
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class AuthDataResponse(BaseModel):
    """Response body for login and signup."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshResponse(BaseModel):
    """Response body for token refresh."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UpdateProfileRequest(BaseModel):
    full_name: str

    @field_validator("full_name")
    @classmethod
    def full_name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("full_name is required")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("New password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("New password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("New password must contain at least one digit")
        if not any(c in "!@#$%^&*()_+-=[]{}|;':\",./<>?`~" for c in v):
            raise ValueError("New password must contain at least one special character")
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str | None = None


class VerifyResetCodeRequest(BaseModel):
    email: EmailStr
    code: str


class VerifyResetCodeResponse(BaseModel):
    message: str
    reset_token: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("New password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("New password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("New password must contain at least one digit")
        if not any(c in "!@#$%^&*()_+-=[]{}|;':\",./<>?`~" for c in v):
            raise ValueError("New password must contain at least one special character")
        return v
