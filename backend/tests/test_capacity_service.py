"""Tests for host capacity calculation and booking validation service logic."""

from __future__ import annotations

from datetime import date, timedelta

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


async def _create_workflow_type(session: AsyncSession) -> int:
    workflow = WorkflowType(name="Training")
    session.add(workflow)
    await session.flush()
    return workflow.id


async def _create_host_type(
    session: AsyncSession,
    gpu_type: str,
    total_count: int,
    gpu_count: int = 8,
) -> GpuHostType:
    host_type = GpuHostType(
        gpu_type=gpu_type,
        gpu_count=gpu_count,
        total_count=total_count,
    )
    session.add(host_type)
    await session.flush()
    return host_type


async def _create_booking(
    session: AsyncSession,
    *,
    user_email: str,
    gpu_host_type_id: int,
    host_count: int,
    start_date: date,
    end_date: date,
    status: BookingStatus,
    workflow_type_id: int,
) -> Booking:
    booking = Booking(
        user_email=user_email,
        gpu_host_type_id=gpu_host_type_id,
        host_count=host_count,
        workflow_type_id=workflow_type_id,
        start_date=start_date,
        end_date=end_date,
        status=status,
    )
    session.add(booking)
    await session.flush()
    return booking


@pytest.mark.anyio
async def test_get_daily_capacity_no_bookings_returns_full_availability(
    db_session: AsyncSession,
) -> None:
    await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    await db_session.commit()

    capacities = await get_daily_capacity(
        db_session,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 3),
        gpu_host_type_id=host_type.id,
    )

    assert len(capacities) == 3
    for day in capacities:
        assert day.total == 5
        assert day.confirmed_used == 0
        assert day.pending_used == 0
        assert day.available == 5


@pytest.mark.anyio
async def test_get_daily_capacity_counts_confirmed_overlap(
    db_session: AsyncSession,
) -> None:
    workflow_id = await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    await _create_booking(
        db_session,
        user_email="user@example.com",
        gpu_host_type_id=host_type.id,
        host_count=2,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 2),
        status=BookingStatus.confirmed,
        workflow_type_id=workflow_id,
    )
    await db_session.commit()

    capacities = await get_daily_capacity(
        db_session,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 3),
        gpu_host_type_id=host_type.id,
    )

    assert capacities[0].confirmed_used == 2
    assert capacities[0].available == 3
    assert capacities[1].confirmed_used == 2
    assert capacities[1].available == 3
    assert capacities[2].confirmed_used == 0
    assert capacities[2].available == 5


@pytest.mark.anyio
async def test_get_daily_capacity_counts_unconfirmed_as_pending_only(
    db_session: AsyncSession,
) -> None:
    workflow_id = await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    await _create_booking(
        db_session,
        user_email="user@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 1),
        status=BookingStatus.unconfirmed,
        workflow_type_id=workflow_id,
    )
    await db_session.commit()

    capacities = await get_daily_capacity(
        db_session,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 1),
        gpu_host_type_id=host_type.id,
    )

    assert capacities[0].pending_used == 1
    assert capacities[0].confirmed_used == 0
    assert capacities[0].available == 5


@pytest.mark.anyio
async def test_get_daily_capacity_counts_spot_and_tentative_as_confirmed(
    db_session: AsyncSession,
) -> None:
    workflow_id = await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    await _create_booking(
        db_session,
        user_email="user1@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 1),
        status=BookingStatus.spot,
        workflow_type_id=workflow_id,
    )
    await _create_booking(
        db_session,
        user_email="user2@example.com",
        gpu_host_type_id=host_type.id,
        host_count=2,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 1),
        status=BookingStatus.tentative,
        workflow_type_id=workflow_id,
    )
    await db_session.commit()

    capacities = await get_daily_capacity(
        db_session,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 1),
        gpu_host_type_id=host_type.id,
    )

    assert capacities[0].confirmed_used == 3
    assert capacities[0].available == 2


@pytest.mark.anyio
async def test_validate_booking_returns_valid_without_warnings(
    db_session: AsyncSession,
) -> None:
    await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    await db_session.commit()

    start = date.today() + timedelta(days=30)
    end = start + timedelta(days=2)

    result = await validate_booking(
        db_session,
        user_email="new-user@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=start,
        end_date=end,
    )

    assert result.valid is True
    assert result.blocked is False
    assert result.warnings == []


@pytest.mark.anyio
async def test_validate_booking_blocks_when_confirmed_capacity_exceeded(
    db_session: AsyncSession,
) -> None:
    workflow_id = await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 2)
    day = date(2026, 4, 1)
    await _create_booking(
        db_session,
        user_email="existing@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=day,
        end_date=day,
        status=BookingStatus.confirmed,
        workflow_type_id=workflow_id,
    )
    await db_session.commit()

    result = await validate_booking(
        db_session,
        user_email="new@example.com",
        gpu_host_type_id=host_type.id,
        host_count=2,
        start_date=day,
        end_date=day,
    )

    assert result.blocked is True
    assert result.valid is False
    assert result.block_reason is not None
    assert "100%" in result.block_reason


@pytest.mark.anyio
async def test_validate_booking_warns_when_user_exceeds_40_percent(
    db_session: AsyncSession,
) -> None:
    workflow_id = await _create_workflow_type(db_session)
    h100 = await _create_host_type(db_session, "H100", 5)
    a100 = await _create_host_type(db_session, "A100", 5)
    day = date(2026, 4, 1)
    await _create_booking(
        db_session,
        user_email="owner@example.com",
        gpu_host_type_id=h100.id,
        host_count=4,
        start_date=day,
        end_date=day,
        status=BookingStatus.confirmed,
        workflow_type_id=workflow_id,
    )
    await db_session.commit()

    result = await validate_booking(
        db_session,
        user_email="owner@example.com",
        gpu_host_type_id=a100.id,
        host_count=1,
        start_date=day,
        end_date=day,
    )

    assert result.valid is True
    assert result.blocked is False
    assert any("40%" in warning.message for warning in result.warnings)


@pytest.mark.anyio
async def test_validate_booking_warns_on_duration_over_14_days(
    db_session: AsyncSession,
) -> None:
    await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    await db_session.commit()

    start = date.today() + timedelta(days=30)
    end = start + timedelta(days=14)
    result = await validate_booking(
        db_session,
        user_email="user@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=start,
        end_date=end,
    )

    assert any("14-day" in warning.message for warning in result.warnings)


@pytest.mark.anyio
async def test_validate_booking_warns_on_less_than_14_days_advance_notice(
    db_session: AsyncSession,
) -> None:
    await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    await db_session.commit()

    start = date.today() + timedelta(days=5)
    result = await validate_booking(
        db_session,
        user_email="user@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=start,
        end_date=start,
    )

    assert any("2 weeks" in warning.message for warning in result.warnings)


@pytest.mark.anyio
async def test_validate_booking_no_advance_notice_warning_at_exactly_14_days(
    db_session: AsyncSession,
) -> None:
    await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    await db_session.commit()

    start = date.today() + timedelta(days=14)
    result = await validate_booking(
        db_session,
        user_email="user@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=start,
        end_date=start,
    )

    assert not any("2 weeks" in warning.message for warning in result.warnings)


@pytest.mark.anyio
async def test_validate_booking_no_duration_warning_at_exactly_14_days(
    db_session: AsyncSession,
) -> None:
    await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    await db_session.commit()

    start = date.today() + timedelta(days=20)
    end = start + timedelta(days=13)
    result = await validate_booking(
        db_session,
        user_email="user@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=start,
        end_date=end,
    )

    assert not any("14-day" in warning.message for warning in result.warnings)


@pytest.mark.anyio
async def test_validate_booking_blocks_when_existing_usage_is_100_percent(
    db_session: AsyncSession,
) -> None:
    workflow_id = await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 1)
    day = date(2026, 4, 1)
    await _create_booking(
        db_session,
        user_email="full@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=day,
        end_date=day,
        status=BookingStatus.confirmed,
        workflow_type_id=workflow_id,
    )
    await db_session.commit()

    result = await validate_booking(
        db_session,
        user_email="new@example.com",
        gpu_host_type_id=host_type.id,
        host_count=1,
        start_date=day,
        end_date=day,
    )

    assert result.blocked is True


@pytest.mark.anyio
async def test_validate_booking_excludes_booking_id_from_capacity_calculation(
    db_session: AsyncSession,
) -> None:
    workflow_id = await _create_workflow_type(db_session)
    host_type = await _create_host_type(db_session, "H100", 5)
    day = date(2026, 4, 1)
    await _create_booking(
        db_session,
        user_email="other@example.com",
        gpu_host_type_id=host_type.id,
        host_count=3,
        start_date=day,
        end_date=day,
        status=BookingStatus.confirmed,
        workflow_type_id=workflow_id,
    )
    to_exclude = await _create_booking(
        db_session,
        user_email="editor@example.com",
        gpu_host_type_id=host_type.id,
        host_count=2,
        start_date=day,
        end_date=day,
        status=BookingStatus.confirmed,
        workflow_type_id=workflow_id,
    )
    await db_session.commit()

    result = await validate_booking(
        db_session,
        user_email="editor@example.com",
        gpu_host_type_id=host_type.id,
        host_count=2,
        start_date=day,
        end_date=day,
        exclude_booking_id=to_exclude.id,
    )

    assert result.blocked is False
