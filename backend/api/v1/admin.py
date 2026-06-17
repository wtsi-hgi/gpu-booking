"""Admin reference data management API endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import (
    AdminBookingUpdate,
    BookingResponse,
    BookingStatus,
    GpuHostTypeCreate,
    GpuHostTypeResponse,
    GpuHostTypeUpdate,
    UserInfo,
    WorkflowTypeCreate,
    WorkflowTypeResponse,
    WorkflowTypeUpdate,
)
from db.engine import get_session
from db.models import Booking, GpuHostType, WorkflowType
from db.models import BookingStatus as DbBookingStatus
from middleware.auth import require_admin
from services.capacity_service import validate_booking

router = APIRouter(prefix="/admin")

_CAPACITY_CONSUMING_STATUSES: set[BookingStatus] = {
    BookingStatus.confirmed,
    BookingStatus.tentative,
    BookingStatus.spot,
}


async def _ensure_booking_reference_data_exists(
    session: AsyncSession,
    *,
    gpu_host_type_id: int,
    workflow_type_id: int,
) -> None:
    """Validate that all booking reference records exist."""

    if await session.get(GpuHostType, gpu_host_type_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="GPU host type not found",
        )
    if await session.get(WorkflowType, workflow_type_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow type not found",
        )


@router.patch("/bookings/{booking_id}", response_model=BookingResponse)
async def admin_update_booking(
    booking_id: int,
    update: AdminBookingUpdate,
    user: Annotated[UserInfo, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BookingResponse:
    """Admin update a booking and enforce status/capacity rules."""

    from api.v1.bookings import _build_booking_response

    booking = await session.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    update_data = update.model_dump(exclude_unset=True)

    next_status = update_data.get("status", booking.status)
    if isinstance(next_status, str):
        next_status = BookingStatus(next_status)

    gpu_host_type_id = update_data.get("gpu_host_type_id", booking.gpu_host_type_id)
    host_count = update_data.get("host_count", booking.host_count)
    start_date = update_data.get("start_date", booking.start_date)
    end_date = update_data.get("end_date", booking.end_date)
    workflow_type_id = update_data.get("workflow_type_id", booking.workflow_type_id)

    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be before end date",
        )

    await _ensure_booking_reference_data_exists(
        session,
        gpu_host_type_id=gpu_host_type_id,
        workflow_type_id=workflow_type_id,
    )

    validation = await validate_booking(
        session,
        user_email=booking.user_email,
        gpu_host_type_id=gpu_host_type_id,
        host_count=host_count,
        start_date=start_date,
        end_date=end_date,
        exclude_booking_id=booking.id,
    )

    capacity_relevant_changed = any(
        field in update_data
        for field in {
            "status",
            "gpu_host_type_id",
            "host_count",
            "start_date",
            "end_date",
        }
    )
    if (
        capacity_relevant_changed
        and next_status in _CAPACITY_CONSUMING_STATUSES
        and validation.blocked
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=validation.block_reason or "100% capacity exceeded",
        )

    for field, value in update_data.items():
        if field == "status":
            setattr(booking, field, DbBookingStatus(value))
            continue
        setattr(booking, field, value)

    booking.admin_modified_by = user.email
    booking.admin_modified_at = datetime.utcnow()

    await session.commit()
    await session.refresh(booking)

    warning_messages = [warning.message for warning in validation.warnings]
    return await _build_booking_response(
        session,
        booking,
        warning_messages,
        is_admin=True,
    )


def _is_unique_violation(error: IntegrityError) -> bool:
    """Return true when an integrity error represents a unique constraint conflict."""

    message = str(error.orig).lower()
    return "unique" in message


@router.post(
    "/gpu-host-types",
    response_model=GpuHostTypeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_gpu_host_type(
    payload: GpuHostTypeCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> GpuHostTypeResponse:
    """Create a new GPU host type."""

    gpu_host_type = GpuHostType(**payload.model_dump())
    session.add(gpu_host_type)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        if _is_unique_violation(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="GPU host type already exists",
            ) from error
        raise

    await session.refresh(gpu_host_type)
    return GpuHostTypeResponse.model_validate(gpu_host_type)


@router.put("/gpu-host-types/{gpu_host_type_id}", response_model=GpuHostTypeResponse)
async def update_gpu_host_type(
    gpu_host_type_id: int,
    payload: GpuHostTypeUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> GpuHostTypeResponse:
    """Update an existing GPU host type."""

    result = await session.execute(
        select(GpuHostType).where(GpuHostType.id == gpu_host_type_id)
    )
    gpu_host_type = result.scalar_one_or_none()
    if gpu_host_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(gpu_host_type, field, value)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        if _is_unique_violation(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="GPU host type already exists",
            ) from error
        raise

    await session.refresh(gpu_host_type)
    return GpuHostTypeResponse.model_validate(gpu_host_type)


@router.post(
    "/workflow-types",
    response_model=WorkflowTypeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_workflow_type(
    payload: WorkflowTypeCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> WorkflowTypeResponse:
    """Create a new workflow type."""

    workflow_type = WorkflowType(**payload.model_dump())
    session.add(workflow_type)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        if _is_unique_violation(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Workflow type with this name already exists",
            ) from error
        raise

    await session.refresh(workflow_type)
    return WorkflowTypeResponse.model_validate(workflow_type)


@router.put("/workflow-types/{workflow_type_id}", response_model=WorkflowTypeResponse)
async def update_workflow_type(
    workflow_type_id: int,
    payload: WorkflowTypeUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> WorkflowTypeResponse:
    """Update an existing workflow type."""

    result = await session.execute(
        select(WorkflowType).where(WorkflowType.id == workflow_type_id)
    )
    workflow_type = result.scalar_one_or_none()
    if workflow_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(workflow_type, field, value)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        if _is_unique_violation(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Workflow type with this name already exists",
            ) from error
        raise

    await session.refresh(workflow_type)
    return WorkflowTypeResponse.model_validate(workflow_type)


@router.delete(
    "/workflow-types/{workflow_type_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_workflow_type(
    workflow_type_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> Response:
    """Delete a workflow type when it is not referenced by bookings."""

    result = await session.execute(
        select(WorkflowType).where(WorkflowType.id == workflow_type_id)
    )
    workflow_type = result.scalar_one_or_none()
    if workflow_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    in_use_result = await session.execute(
        select(Booking.id).where(Booking.workflow_type_id == workflow_type_id).limit(1)
    )
    if in_use_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workflow type is in use by existing bookings",
        )

    await session.delete(workflow_type)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
