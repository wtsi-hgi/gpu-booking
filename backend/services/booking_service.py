"""Booking service functions for create-booking business rules."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import BookingCreate, CapacityWarning
from db.models import Booking, GpuType, GramOption, MemoryOption, WorkflowType
from services.capacity_service import validate_booking


async def _validate_reference_data(session: AsyncSession, data: BookingCreate) -> None:
    """Validate that all requested reference records exist."""

    if await session.get(GpuType, data.gpu_type_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="GPU type not found",
        )
    if await session.get(GramOption, data.gram_option_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="GRAM option not found",
        )
    if await session.get(MemoryOption, data.memory_option_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory option not found",
        )
    if await session.get(WorkflowType, data.workflow_type_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow type not found",
        )


async def create_booking(
    session: AsyncSession,
    user_email: str,
    data: BookingCreate,
) -> tuple[Booking, list[CapacityWarning]]:
    """Create booking and return it with any warnings."""

    await _validate_reference_data(session, data)

    validation = await validate_booking(
        session,
        user_email=user_email,
        gpu_type_id=data.gpu_type_id,
        gpu_count=data.gpu_count,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    if validation.blocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=validation.block_reason or "100% capacity exceeded",
        )

    booking = Booking(
        user_email=user_email,
        gpu_type_id=data.gpu_type_id,
        gpu_count=data.gpu_count,
        gram_option_id=data.gram_option_id,
        memory_option_id=data.memory_option_id,
        workflow_type_id=data.workflow_type_id,
        start_date=data.start_date,
        end_date=data.end_date,
        alt_email=data.alt_email,
        project_name=data.project_name,
        project_pi=data.project_pi,
        project_grant_number=data.project_grant_number,
        technical_lead=data.technical_lead,
        event_start_date=data.event_start_date,
        event_end_date=data.event_end_date,
    )

    session.add(booking)
    await session.commit()
    await session.refresh(booking)
    return booking, validation.warnings
