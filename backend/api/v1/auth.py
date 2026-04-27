"""Authentication API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from api.schemas import UserInfo
from middleware.auth import get_current_user

router = APIRouter()


@router.get("/auth/me", response_model=UserInfo)
async def get_me(
    user: Annotated[UserInfo, Depends(get_current_user)],
) -> UserInfo:
    """Return current user information."""

    return user
