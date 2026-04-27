"""Tests for the capacity API endpoint."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from config import settings
from db.engine import async_session_factory, engine
from db.models import (
    Base,
    Booking,
    BookingStatus,
    GpuType,
    GramOption,
    MemoryOption,
    WorkflowType,
)
from db.seed import seed_db
from main import app


async def _get_reference_ids() -> tuple[int, int, int, int]:
    """Return seeded reference IDs required to create bookings."""

    async with async_session_factory() as session:
        gpu_type_result = await session.execute(
            select(GpuType).where(GpuType.name == "H100")
        )
        gpu_type = gpu_type_result.scalar_one()

        gram_result = await session.execute(select(GramOption).order_by(GramOption.id))
        gram_option = gram_result.scalars().first()

        memory_result = await session.execute(
            select(MemoryOption).order_by(MemoryOption.id)
        )
        memory_option = memory_result.scalars().first()

        workflow_result = await session.execute(
            select(WorkflowType).order_by(WorkflowType.id)
        )
        workflow_type = workflow_result.scalars().first()

        assert gram_option is not None
        assert memory_option is not None
        assert workflow_type is not None

        return gpu_type.id, gram_option.id, memory_option.id, workflow_type.id


async def _insert_booking(
    *,
    user_email: str,
    gpu_type_id: int,
    gpu_count: int,
    gram_option_id: int,
    memory_option_id: int,
    workflow_type_id: int,
    start_date: date,
    end_date: date,
    status: BookingStatus,
) -> None:
    """Insert a booking record for capacity endpoint scenarios."""

    async with async_session_factory() as session:
        session.add(
            Booking(
                user_email=user_email,
                gpu_type_id=gpu_type_id,
                gpu_count=gpu_count,
                gram_option_id=gram_option_id,
                memory_option_id=memory_option_id,
                workflow_type_id=workflow_type_id,
                start_date=start_date,
                end_date=end_date,
                status=status,
            )
        )
        await session.commit()


@pytest.mark.anyio
async def test_get_capacity_returns_daily_capacity_list_when_bookings_exist() -> None:
    """Return a list of DailyCapacity objects for the requested date range."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    await _insert_booking(
        user_email="user@example.com",
        gpu_type_id=gpu_type_id,
        gpu_count=5,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 2),
        end_date=date(2026, 3, 3),
        status=BookingStatus.confirmed,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/capacity",
            params={"start_date": "2026-03-01", "end_date": "2026-03-03"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert len(payload) > 0
    first = payload[0]
    assert first["date"]
    assert isinstance(first["gpu_type_id"], int)
    assert isinstance(first["gpu_type_name"], str)
    assert isinstance(first["total"], int)
    assert isinstance(first["confirmed_used"], int)
    assert isinstance(first["pending_used"], int)
    assert isinstance(first["available"], int)
    assert isinstance(first["user_used"], int)
    assert isinstance(first["user_percent"], float | int)
    assert isinstance(first["warnings"], list)


@pytest.mark.anyio
async def test_get_capacity_no_bookings_returns_full_availability() -> None:
    """Return full capacity for each day when no bookings exist."""

    (gpu_type_id, _, _, _) = await _get_reference_ids()
    async with async_session_factory() as session:
        gpu_type = await session.get(GpuType, gpu_type_id)
    assert gpu_type is not None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/capacity",
            params={
                "start_date": "2026-03-01",
                "end_date": "2026-03-03",
                "gpu_type_id": gpu_type_id,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 3
    for day in payload:
        assert day["total"] == gpu_type.total_count
        assert day["confirmed_used"] == 0
        assert day["available"] == gpu_type.total_count


@pytest.mark.anyio
async def test_get_capacity_missing_start_date_returns_422() -> None:
    """Return validation error when required start_date query parameter is missing."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/capacity",
            params={"end_date": "2026-03-03"},
        )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_validate_capacity_returns_valid_for_compliant_booking() -> None:
    """Return valid with no warnings when proposed booking is within rules."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    start = date.today() + timedelta(days=30)
    end = start + timedelta(days=2)

    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 4,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/capacity/validate", json=payload)

    assert response.status_code == 200
    assert response.json() == {
        "valid": True,
        "warnings": [],
        "blocked": False,
        "block_reason": None,
    }


@pytest.mark.anyio
async def test_validate_capacity_blocks_when_capacity_is_exceeded() -> None:
    """Return blocked with a reason when proposed booking exceeds 100% capacity."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    day = date.today() + timedelta(days=30)
    await _insert_booking(
        user_email="full@example.com",
        gpu_type_id=gpu_type_id,
        gpu_count=40,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=day,
        end_date=day,
        status=BookingStatus.confirmed,
    )

    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 1,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": day.isoformat(),
        "end_date": day.isoformat(),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/capacity/validate", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert body["blocked"] is True
    assert body["block_reason"] is not None


@pytest.fixture(autouse=True)
def _force_insecure_auth_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force insecure mode to keep tests deterministic with X-Dev-User."""

    monkeypatch.setattr(settings, "auth_mode", "insecure")


@pytest.fixture(autouse=True)
async def _reset_and_seed_database() -> None:
    """Reset and seed the database before each test."""

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        await seed_db(session)
