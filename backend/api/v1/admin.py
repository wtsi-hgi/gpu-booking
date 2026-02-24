"""Admin reference data management API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import (
    GpuTypeCreate,
    GpuTypeResponse,
    GpuTypeUpdate,
    GramOptionCreate,
    GramOptionResponse,
    GramOptionUpdate,
    MemoryOptionCreate,
    MemoryOptionResponse,
    MemoryOptionUpdate,
    UserInfo,
    WorkflowTypeCreate,
    WorkflowTypeResponse,
    WorkflowTypeUpdate,
)
from db.engine import get_session
from db.models import Booking, GpuType, GramOption, MemoryOption, WorkflowType
from middleware.auth import require_admin

router = APIRouter(prefix="/admin")


def _is_unique_violation(error: IntegrityError) -> bool:
    """Return true when an integrity error represents a unique constraint conflict."""

    message = str(error.orig).lower()
    return "unique" in message


@router.post(
    "/gpu-types",
    response_model=GpuTypeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_gpu_type(
    payload: GpuTypeCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> GpuTypeResponse:
    """Create a new GPU type."""

    gpu_type = GpuType(**payload.model_dump())
    session.add(gpu_type)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        if _is_unique_violation(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="GPU type with this name already exists",
            ) from error
        raise

    await session.refresh(gpu_type)
    return GpuTypeResponse.model_validate(gpu_type)


@router.put("/gpu-types/{gpu_type_id}", response_model=GpuTypeResponse)
async def update_gpu_type(
    gpu_type_id: int,
    payload: GpuTypeUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> GpuTypeResponse:
    """Update an existing GPU type."""

    result = await session.execute(select(GpuType).where(GpuType.id == gpu_type_id))
    gpu_type = result.scalar_one_or_none()
    if gpu_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(gpu_type, field, value)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        if _is_unique_violation(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="GPU type with this name already exists",
            ) from error
        raise

    await session.refresh(gpu_type)
    return GpuTypeResponse.model_validate(gpu_type)


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


@router.post(
    "/gram-options",
    response_model=GramOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_gram_option(
    payload: GramOptionCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> GramOptionResponse:
    """Create a new GRAM option."""

    gram_option = GramOption(**payload.model_dump())
    session.add(gram_option)
    await session.commit()
    await session.refresh(gram_option)
    return GramOptionResponse.model_validate(gram_option)


@router.put("/gram-options/{gram_option_id}", response_model=GramOptionResponse)
async def update_gram_option(
    gram_option_id: int,
    payload: GramOptionUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> GramOptionResponse:
    """Update an existing GRAM option."""

    result = await session.execute(
        select(GramOption).where(GramOption.id == gram_option_id)
    )
    gram_option = result.scalar_one_or_none()
    if gram_option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(gram_option, field, value)

    await session.commit()
    await session.refresh(gram_option)
    return GramOptionResponse.model_validate(gram_option)


@router.delete("/gram-options/{gram_option_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gram_option(
    gram_option_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> Response:
    """Delete a GRAM option when it is not referenced by bookings."""

    result = await session.execute(
        select(GramOption).where(GramOption.id == gram_option_id)
    )
    gram_option = result.scalar_one_or_none()
    if gram_option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    in_use_result = await session.execute(
        select(Booking.id).where(Booking.gram_option_id == gram_option_id).limit(1)
    )
    if in_use_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="GRAM option is in use by existing bookings",
        )

    await session.delete(gram_option)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/memory-options",
    response_model=MemoryOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_memory_option(
    payload: MemoryOptionCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> MemoryOptionResponse:
    """Create a new memory option."""

    memory_option = MemoryOption(**payload.model_dump())
    session.add(memory_option)
    await session.commit()
    await session.refresh(memory_option)
    return MemoryOptionResponse.model_validate(memory_option)


@router.put("/memory-options/{memory_option_id}", response_model=MemoryOptionResponse)
async def update_memory_option(
    memory_option_id: int,
    payload: MemoryOptionUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> MemoryOptionResponse:
    """Update an existing memory option."""

    result = await session.execute(
        select(MemoryOption).where(MemoryOption.id == memory_option_id)
    )
    memory_option = result.scalar_one_or_none()
    if memory_option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(memory_option, field, value)

    await session.commit()
    await session.refresh(memory_option)
    return MemoryOptionResponse.model_validate(memory_option)


@router.delete(
    "/memory-options/{memory_option_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_memory_option(
    memory_option_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: Annotated[UserInfo, Depends(require_admin)],
) -> Response:
    """Delete a memory option when it is not referenced by bookings."""

    result = await session.execute(
        select(MemoryOption).where(MemoryOption.id == memory_option_id)
    )
    memory_option = result.scalar_one_or_none()
    if memory_option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    in_use_result = await session.execute(
        select(Booking.id).where(Booking.memory_option_id == memory_option_id).limit(1)
    )
    if in_use_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Memory option is in use by existing bookings",
        )

    await session.delete(memory_option)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
