"""Public reference data API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import (
    GpuHostTypeResponse,
    WorkflowTypeResponse,
)
from db.engine import get_session
from db.models import GpuHostType, WorkflowType

router = APIRouter()


@router.get("/gpu-host-types", response_model=list[GpuHostTypeResponse])
async def list_gpu_host_types(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[GpuHostTypeResponse]:
    """List all GPU host types."""

    result = await session.execute(select(GpuHostType).order_by(GpuHostType.id))
    gpu_host_types = result.scalars().all()
    return [
        GpuHostTypeResponse.model_validate(gpu_host_type)
        for gpu_host_type in gpu_host_types
    ]


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
