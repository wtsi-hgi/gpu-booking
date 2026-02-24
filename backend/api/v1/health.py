"""Health check endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db.engine import get_session

from ..schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> HealthResponse | JSONResponse:
    """Health check endpoint for monitoring and load balancers."""

    try:
        await session.execute(text("SELECT 1"))
    except Exception as error:
        payload = HealthResponse(status="unhealthy", database=f"error: {error}")
        return JSONResponse(status_code=503, content=payload.model_dump())

    return HealthResponse(status="healthy", database="ok")
