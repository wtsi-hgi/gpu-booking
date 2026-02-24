"""Pydantic models used across the API layer."""

from pydantic import BaseModel


class MessageResponse(BaseModel):
    """Standard message response model."""

    message: str


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    database: str


class UserInfo(BaseModel):
    """Authenticated user information used by auth dependencies."""

    email: str
    is_admin: bool
    auth_mode: str
