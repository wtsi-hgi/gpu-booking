"""Tests for SQLAlchemy ORM models."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import selectinload
from sqlalchemy.pool import StaticPool

from db.models import Base, Booking, BookingStatus, GpuHostType, WorkflowType


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


async def _create_booking_dependencies(session: AsyncSession) -> tuple[int, int]:
    """Insert and return required foreign key IDs for booking creation."""

    host_type = GpuHostType(gpu_type="A100", gpu_count=8, total_count=2)
    workflow_type = WorkflowType(name="Training")

    session.add_all([host_type, workflow_type])
    await session.commit()

    return host_type.id, workflow_type.id


@pytest.mark.anyio
async def test_booking_insert_and_query_defaults_status_unconfirmed(
    db_session: AsyncSession,
) -> None:
    host_type_id, workflow_type_id = await _create_booking_dependencies(db_session)

    booking = Booking(
        user_email="user@example.com",
        gpu_host_type_id=host_type_id,
        host_count=2,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 4),
    )
    db_session.add(booking)
    await db_session.commit()

    result = await db_session.execute(select(Booking).where(Booking.id == booking.id))
    stored_booking = result.scalar_one()

    assert stored_booking.user_email == "user@example.com"
    assert stored_booking.host_count == 2
    assert stored_booking.status == BookingStatus.unconfirmed


@pytest.mark.anyio
async def test_gpu_host_type_insert_and_query_by_shape(
    db_session: AsyncSession,
) -> None:
    host_type = GpuHostType(gpu_type="H100", gpu_count=8, total_count=2)
    db_session.add(host_type)
    await db_session.commit()

    result = await db_session.execute(
        select(GpuHostType).where(
            GpuHostType.gpu_type == "H100",
            GpuHostType.gpu_count == 8,
        )
    )
    stored_host_type = result.scalar_one()

    assert stored_host_type.gpu_type == "H100"
    assert stored_host_type.gpu_count == 8
    assert stored_host_type.total_count == 2


@pytest.mark.anyio
async def test_booking_gpu_host_type_foreign_key_relationship(
    db_session: AsyncSession,
) -> None:
    host_type = GpuHostType(gpu_type="L40S", gpu_count=4, total_count=3)
    workflow_type = WorkflowType(name="Inference")
    db_session.add_all([host_type, workflow_type])
    await db_session.commit()

    booking = Booking(
        user_email="researcher@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        workflow_type_id=workflow_type.id,
        start_date=date(2026, 4, 10),
        end_date=date(2026, 4, 11),
    )
    db_session.add(booking)
    await db_session.commit()

    result = await db_session.execute(
        select(Booking)
        .options(selectinload(Booking.gpu_host_type))
        .where(Booking.id == booking.id)
    )
    stored_booking = result.scalar_one()

    assert stored_booking.gpu_host_type.id == host_type.id
    assert stored_booking.gpu_host_type.gpu_type == "L40S"
    assert stored_booking.gpu_host_type.gpu_count == 4


@pytest.mark.anyio
async def test_booking_missing_required_user_email_raises_integrity_error(
    db_session: AsyncSession,
) -> None:
    host_type_id, workflow_type_id = await _create_booking_dependencies(db_session)

    booking = Booking(
        user_email=None,
        gpu_host_type_id=host_type_id,
        host_count=1,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 2, 1),
        end_date=date(2026, 2, 2),
    )
    db_session.add(booking)

    with pytest.raises(IntegrityError):
        await db_session.commit()


@pytest.mark.anyio
async def test_gpu_host_type_duplicate_shape_raises_integrity_error(
    db_session: AsyncSession,
) -> None:
    db_session.add(GpuHostType(gpu_type="H100", gpu_count=8, total_count=2))
    await db_session.commit()

    db_session.add(GpuHostType(gpu_type="H100", gpu_count=8, total_count=4))

    with pytest.raises(IntegrityError):
        await db_session.commit()


@pytest.mark.anyio
async def test_booking_status_defaults_to_unconfirmed(
    db_session: AsyncSession,
) -> None:
    host_type_id, workflow_type_id = await _create_booking_dependencies(db_session)

    booking = Booking(
        user_email="status-default@example.com",
        gpu_host_type_id=host_type_id,
        host_count=1,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 2),
    )
    db_session.add(booking)
    await db_session.commit()
    await db_session.refresh(booking)

    assert booking.status == BookingStatus.unconfirmed
