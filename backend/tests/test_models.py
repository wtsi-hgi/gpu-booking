"""Tests for SQLAlchemy ORM models defined in A2."""

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

from db.models import (
    Base,
    Booking,
    BookingStatus,
    GpuType,
    GramOption,
    MemoryOption,
    WorkflowType,
)


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


async def _create_booking_dependencies(session: AsyncSession) -> tuple[int, int, int]:
    """Insert and return required foreign key IDs for booking creation."""

    gpu_type = GpuType(name="A100", gram_gb=80, system_memory_gb=500, total_count=16)
    gram_option = GramOption(label="80GB", value_gb=80, sort_order=1)
    memory_option = MemoryOption(label="500GB", value_gb=500, sort_order=1)
    workflow_type = WorkflowType(name="Training")

    session.add_all([gpu_type, gram_option, memory_option, workflow_type])
    await session.commit()

    return gpu_type.id, gram_option.id, memory_option.id, workflow_type.id


@pytest.mark.anyio
async def test_booking_insert_and_query_defaults_status_unconfirmed(
    db_session: AsyncSession,
) -> None:
    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _create_booking_dependencies(db_session)

    booking = Booking(
        user_email="user@example.com",
        gpu_type_id=gpu_type_id,
        gpu_count=2,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 4),
    )
    db_session.add(booking)
    await db_session.commit()

    result = await db_session.execute(select(Booking).where(Booking.id == booking.id))
    stored_booking = result.scalar_one()

    assert stored_booking.user_email == "user@example.com"
    assert stored_booking.gpu_count == 2
    assert stored_booking.status == BookingStatus.unconfirmed


@pytest.mark.anyio
async def test_gpu_type_insert_and_query_by_name(db_session: AsyncSession) -> None:
    gpu_type = GpuType(name="H100", gram_gb=80, system_memory_gb=500, total_count=40)
    db_session.add(gpu_type)
    await db_session.commit()

    result = await db_session.execute(select(GpuType).where(GpuType.name == "H100"))
    stored_gpu_type = result.scalar_one()

    assert stored_gpu_type.gram_gb == 80
    assert stored_gpu_type.system_memory_gb == 500
    assert stored_gpu_type.total_count == 40


@pytest.mark.anyio
async def test_booking_gpu_type_foreign_key_relationship(
    db_session: AsyncSession,
) -> None:
    gpu_type = GpuType(name="L40S", gram_gb=48, system_memory_gb=256, total_count=8)
    gram_option = GramOption(label="48GB", value_gb=48, sort_order=1)
    memory_option = MemoryOption(label="256GB", value_gb=256, sort_order=1)
    workflow_type = WorkflowType(name="Inference")
    db_session.add_all([gpu_type, gram_option, memory_option, workflow_type])
    await db_session.commit()

    booking = Booking(
        user_email="researcher@example.com",
        gpu_type_id=gpu_type.id,
        gpu_count=1,
        gram_option_id=gram_option.id,
        memory_option_id=memory_option.id,
        workflow_type_id=workflow_type.id,
        start_date=date(2026, 4, 10),
        end_date=date(2026, 4, 11),
    )
    db_session.add(booking)
    await db_session.commit()

    result = await db_session.execute(
        select(Booking)
        .options(selectinload(Booking.gpu_type))
        .where(Booking.id == booking.id)
    )
    stored_booking = result.scalar_one()

    assert stored_booking.gpu_type.id == gpu_type.id
    assert stored_booking.gpu_type.name == "L40S"


@pytest.mark.anyio
async def test_booking_missing_required_user_email_raises_integrity_error(
    db_session: AsyncSession,
) -> None:
    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _create_booking_dependencies(db_session)

    booking = Booking(
        user_email=None,
        gpu_type_id=gpu_type_id,
        gpu_count=1,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 2, 1),
        end_date=date(2026, 2, 2),
    )
    db_session.add(booking)

    with pytest.raises(IntegrityError):
        await db_session.commit()


@pytest.mark.anyio
async def test_gpu_type_duplicate_name_raises_integrity_error(
    db_session: AsyncSession,
) -> None:
    db_session.add(
        GpuType(name="H100", gram_gb=80, system_memory_gb=500, total_count=40)
    )
    await db_session.commit()

    db_session.add(
        GpuType(name="H100", gram_gb=80, system_memory_gb=500, total_count=80)
    )

    with pytest.raises(IntegrityError):
        await db_session.commit()


@pytest.mark.anyio
async def test_booking_status_defaults_to_unconfirmed(
    db_session: AsyncSession,
) -> None:
    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _create_booking_dependencies(db_session)

    booking = Booking(
        user_email="status-default@example.com",
        gpu_type_id=gpu_type_id,
        gpu_count=4,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 2),
    )
    db_session.add(booking)
    await db_session.commit()
    await db_session.refresh(booking)

    assert booking.status == BookingStatus.unconfirmed
