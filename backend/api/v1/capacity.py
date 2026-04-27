"""Capacity endpoints."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import BookingCreate, BookingValidation, DailyCapacity, UserInfo
from db.engine import get_session
from middleware.auth import get_current_user
from services.capacity_service import get_daily_capacity, validate_booking

router = APIRouter()


@router.get("/capacity", response_model=list[DailyCapacity])
async def get_capacity(
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    start_date: date,
    end_date: date,
    gpu_type_id: int | None = None,
) -> list[DailyCapacity]:
    """Get daily capacity for a date range."""

    return await get_daily_capacity(
        session,
        start_date=start_date,
        end_date=end_date,
        gpu_type_id=gpu_type_id,
        user_email=user.email,
    )


@router.post("/capacity/validate", response_model=BookingValidation)
async def validate_booking_request(
    booking: BookingCreate,
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BookingValidation:
    """Preview validation for a proposed booking."""

    return await validate_booking(
        session,
        user_email=user.email,
        gpu_type_id=booking.gpu_type_id,
        gpu_count=booking.gpu_count,
        start_date=booking.start_date,
        end_date=booking.end_date,
    )
