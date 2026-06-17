"""Booking endpoints."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import BookingCreate, BookingResponse, BookingStatus, UserInfo
from db.engine import get_session
from db.models import (
    Booking,
    GpuHostType,
    WorkflowType,
)
from db.models import (
    BookingStatus as DbBookingStatus,
)
from middleware.auth import get_current_user

router = APIRouter()


async def _build_booking_response(
    session: AsyncSession,
    booking: Booking,
    warnings: list[str],
    is_admin: bool,
) -> BookingResponse:
    """Build a booking response payload including labels and warnings."""

    gpu_host_type = await session.get(GpuHostType, booking.gpu_host_type_id)
    workflow_type = await session.get(WorkflowType, booking.workflow_type_id)

    if gpu_host_type is None or workflow_type is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Booking reference data missing",
        )

    return BookingResponse(
        id=booking.id,
        user_email=booking.user_email,
        gpu_host_type_id=booking.gpu_host_type_id,
        gpu_type=gpu_host_type.gpu_type,
        gpu_count=gpu_host_type.gpu_count,
        host_count=booking.host_count,
        workflow_type_id=booking.workflow_type_id,
        workflow_type_name=workflow_type.name,
        start_date=booking.start_date,
        end_date=booking.end_date,
        status=booking.status,
        reservation_name=booking.reservation_name,
        alt_email=booking.alt_email,
        project_name=booking.project_name,
        project_pi=booking.project_pi,
        project_grant_number=booking.project_grant_number,
        technical_lead=booking.technical_lead,
        event_start_date=booking.event_start_date,
        event_end_date=booking.event_end_date,
        admin_notes=booking.admin_notes if is_admin else None,
        admin_modified_by=booking.admin_modified_by,
        admin_modified_at=booking.admin_modified_at,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        warnings=warnings,
    )


@router.get("/bookings", response_model=list[BookingResponse])
async def list_bookings(
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    start_date: date | None = None,
    end_date: date | None = None,
    gpu_host_type_id: int | None = None,
    status: BookingStatus | None = None,
) -> list[BookingResponse]:
    """List bookings with optional date, GPU host type, and status filters."""

    statement = select(Booking)

    if gpu_host_type_id is not None:
        statement = statement.where(Booking.gpu_host_type_id == gpu_host_type_id)
    if status is not None:
        statement = statement.where(Booking.status == status.value)

    if start_date is not None and end_date is not None:
        statement = statement.where(
            Booking.start_date <= end_date,
            Booking.end_date >= start_date,
        )
    elif start_date is not None:
        statement = statement.where(Booking.end_date >= start_date)
    elif end_date is not None:
        statement = statement.where(Booking.start_date <= end_date)

    statement = statement.order_by(Booking.start_date, Booking.id)
    result = await session.execute(statement)
    bookings = result.scalars().all()

    return [
        await _build_booking_response(
            session,
            booking,
            warnings=[],
            is_admin=user.is_admin,
        )
        for booking in bookings
    ]


@router.post(
    "/bookings",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_booking(
    booking: BookingCreate,
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BookingResponse:
    """Create a new booking with validation and capacity warnings."""

    from services.booking_service import create_booking as create_booking_record

    if booking.start_date > booking.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be before end date",
        )
    if booking.start_date <= date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be in the future",
        )

    created_booking, capacity_warnings = await create_booking_record(
        session,
        user_email=user.email,
        data=booking,
    )
    warning_messages = [warning.message for warning in capacity_warnings]
    return await _build_booking_response(
        session,
        created_booking,
        warning_messages,
        is_admin=user.is_admin,
    )


@router.delete(
    "/bookings/{booking_id}",
    response_model=BookingResponse,
    status_code=status.HTTP_200_OK,
)
async def cancel_booking(
    booking_id: int,
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BookingResponse:
    """Cancel a booking based on owner and admin permissions."""

    booking = await session.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    if not user.is_admin and booking.user_email != user.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to cancel this booking",
        )

    if user.is_admin:
        booking.status = DbBookingStatus.cancelled
        await session.commit()
        await session.refresh(booking)
        return await _build_booking_response(
            session,
            booking,
            [],
            is_admin=user.is_admin,
        )

    if booking.admin_modified_at is None:
        response = await _build_booking_response(session, booking, [], is_admin=False)
        await session.delete(booking)
        await session.commit()
        return response

    booking.status = DbBookingStatus.cancelled
    await session.commit()
    await session.refresh(booking)
    return await _build_booking_response(session, booking, [], is_admin=False)
