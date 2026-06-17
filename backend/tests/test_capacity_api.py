"""Tests for the capacity API endpoint."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from config import settings
from db.engine import async_session_factory, engine
from db.models import Base, Booking, BookingStatus, GpuHostType, WorkflowType
from db.seed import seed_db
from main import app


async def _get_reference_ids() -> tuple[int, int]:
    """Return seeded reference IDs required to create bookings."""

    async with async_session_factory() as session:
        host_type_result = await session.execute(
            select(GpuHostType).where(GpuHostType.gpu_type == "H100")
        )
        host_type = host_type_result.scalar_one()

        workflow_result = await session.execute(
            select(WorkflowType).order_by(WorkflowType.id)
        )
        workflow_type = workflow_result.scalars().first()

        assert workflow_type is not None

        return host_type.id, workflow_type.id


async def _insert_booking(
    *,
    user_email: str,
    gpu_host_type_id: int,
    host_count: int,
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
                gpu_host_type_id=gpu_host_type_id,
                host_count=host_count,
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

    host_type_id, workflow_type_id = await _get_reference_ids()
    await _insert_booking(
        user_email="user@example.com",
        gpu_host_type_id=host_type_id,
        host_count=1,
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
    assert isinstance(first["gpu_host_type_id"], int)
    assert isinstance(first["gpu_type"], str)
    assert isinstance(first["gpu_count"], int)
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

    host_type_id, _ = await _get_reference_ids()
    async with async_session_factory() as session:
        host_type = await session.get(GpuHostType, host_type_id)
    assert host_type is not None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/capacity",
            params={
                "start_date": "2026-03-01",
                "end_date": "2026-03-03",
                "gpu_host_type_id": host_type_id,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 3
    for day in payload:
        assert day["total"] == host_type.total_count
        assert day["confirmed_used"] == 0
        assert day["available"] == host_type.total_count


@pytest.mark.anyio
async def test_host_type_availability_returns_currently_bookable_minimum() -> None:
    """Return each host type's minimum bookable hosts over the requested range."""

    async with async_session_factory() as session:
        h200_result = await session.execute(
            select(GpuHostType).where(GpuHostType.gpu_type == "H200")
        )
        h200 = h200_result.scalar_one()
        h100_result = await session.execute(
            select(GpuHostType).where(GpuHostType.gpu_type == "H100")
        )
        h100 = h100_result.scalar_one()
        workflow_result = await session.execute(
            select(WorkflowType).order_by(WorkflowType.id)
        )
        workflow_type = workflow_result.scalars().first()

    assert workflow_type is not None
    await _insert_booking(
        user_email="h200-holder@example.com",
        gpu_host_type_id=h200.id,
        host_count=2,
        workflow_type_id=workflow_type.id,
        start_date=date(2026, 7, 22),
        end_date=date(2026, 7, 23),
        status=BookingStatus.confirmed,
    )
    await _insert_booking(
        user_email="h100-holder@example.com",
        gpu_host_type_id=h100.id,
        host_count=2,
        workflow_type_id=workflow_type.id,
        start_date=date(2026, 7, 23),
        end_date=date(2026, 7, 23),
        status=BookingStatus.confirmed,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/capacity/host-types/availability",
            params={"start_date": "2026-07-22", "end_date": "2026-07-23"},
        )

    assert response.status_code == 200
    payload = response.json()
    by_type = {item["gpu_type"]: item for item in payload}
    assert by_type["H200"]["currently_bookable"] == 1
    assert by_type["H100"]["currently_bookable"] == 0
    assert by_type["A100"]["currently_bookable"] == 0
    assert by_type["H100"]["total"] == 2


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

    host_type_id, workflow_type_id = await _get_reference_ids()
    start = date.today() + timedelta(days=30)
    end = start + timedelta(days=2)

    payload = {
        "gpu_host_type_id": host_type_id,
        "host_count": 1,
        "workflow_type_id": workflow_type_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "project_grant_number": "CC-12345",
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
    """Return blocked with a reason when proposed booking exceeds capacity."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    day = date.today() + timedelta(days=30)
    await _insert_booking(
        user_email="full@example.com",
        gpu_host_type_id=host_type_id,
        host_count=2,
        workflow_type_id=workflow_type_id,
        start_date=day,
        end_date=day,
        status=BookingStatus.confirmed,
    )

    payload = {
        "gpu_host_type_id": host_type_id,
        "host_count": 1,
        "workflow_type_id": workflow_type_id,
        "start_date": day.isoformat(),
        "end_date": day.isoformat(),
        "project_grant_number": "CC-12345",
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
