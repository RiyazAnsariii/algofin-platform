# app/common/schemas.py
# AlgoFin v1 — Shared response schemas

from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class SuccessResponse(BaseModel, Generic[T]):
    """Standard successful API response wrapper."""

    success: bool = True
    data: T


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: str | None = None


class ErrorResponse(BaseModel):
    """Standard error response."""

    success: bool = False
    error: ErrorDetail


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated list response."""

    success: bool = True
    data: list[T]
    total: int
    page: int
    page_size: int
    has_more: bool
