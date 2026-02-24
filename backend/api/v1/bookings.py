"""Booking endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from api.schemas import UserInfo
from middleware.auth import get_current_user

router = APIRouter()


@router.get("/bookings")
async def list_bookings(
    _user: Annotated[UserInfo, Depends(get_current_user)],
) -> list[dict[str, str]]:
    """List bookings for the current user."""

    return []
