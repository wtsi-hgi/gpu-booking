"""Public reference data API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import (
    GpuTypeResponse,
    GramOptionResponse,
    MemoryOptionResponse,
    WorkflowTypeResponse,
)
from db.engine import get_session
from db.models import GpuType, GramOption, MemoryOption, WorkflowType

router = APIRouter()


@router.get("/gpu-types", response_model=list[GpuTypeResponse])
async def list_gpu_types(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[GpuTypeResponse]:
    """List all GPU types."""

    result = await session.execute(select(GpuType).order_by(GpuType.id))
    gpu_types = result.scalars().all()
    return [GpuTypeResponse.model_validate(gpu_type) for gpu_type in gpu_types]


@router.get("/workflow-types", response_model=list[WorkflowTypeResponse])
async def list_workflow_types(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[WorkflowTypeResponse]:
    """List all workflow types."""

    result = await session.execute(select(WorkflowType).order_by(WorkflowType.id))
    workflow_types = result.scalars().all()
    return [
        WorkflowTypeResponse.model_validate(workflow_type)
        for workflow_type in workflow_types
    ]


@router.get("/gram-options", response_model=list[GramOptionResponse])
async def list_gram_options(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[GramOptionResponse]:
    """List all GRAM options ordered by sort order."""

    result = await session.execute(select(GramOption).order_by(GramOption.sort_order))
    gram_options = result.scalars().all()
    return [GramOptionResponse.model_validate(option) for option in gram_options]


@router.get("/memory-options", response_model=list[MemoryOptionResponse])
async def list_memory_options(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[MemoryOptionResponse]:
    """List all memory options ordered by sort order."""

    result = await session.execute(
        select(MemoryOption).order_by(MemoryOption.sort_order)
    )
    memory_options = result.scalars().all()
    return [MemoryOptionResponse.model_validate(option) for option in memory_options]
