"""Regression tests for whole-host booking capacity semantics."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from db.models import Base, Booking, BookingStatus, GpuHostType, WorkflowType
from services.capacity_service import get_daily_capacity, validate_booking


@pytest.fixture
async def db_session() -> AsyncSession:
    """Yield an async session backed by an in-memory SQLite database."""

    engine: AsyncEngine = create_async_engine(
        "sqlite+aiosqlite://", poolclass=StaticPool
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.mark.anyio
async def test_capacity_counts_requested_hosts_for_each_host_type(
    db_session: AsyncSession,
) -> None:
    host_type = GpuHostType(gpu_type="H100", gpu_count=8, total_count=2)
    workflow_type = WorkflowType(name="Training")
    db_session.add_all([host_type, workflow_type])
    await db_session.flush()

    db_session.add(
        Booking(
            user_email="owner@example.com",
            gpu_host_type_id=host_type.id,
            host_count=1,
            workflow_type_id=workflow_type.id,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 7, 1),
            status=BookingStatus.confirmed,
        )
    )
    await db_session.commit()

    capacity = await get_daily_capacity(
        db_session,
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 1),
        gpu_host_type_id=host_type.id,
    )

    assert capacity[0].total == 2
    assert capacity[0].confirmed_used == 1
    assert capacity[0].available == 1

    validation = await validate_booking(
        db_session,
        user_email="requester@example.com",
        gpu_host_type_id=host_type.id,
        host_count=2,
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 1),
    )

    assert validation.blocked is True
    assert validation.valid is False
