"""Tests for booking creation endpoint validation and warning behaviour."""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from config import settings
from db.engine import async_session_factory, engine
from db.models import (
    Admin,
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


def _date_string(days_from_today: int) -> str:
    """Return an ISO date string offset from today."""

    return (date.today() + timedelta(days=days_from_today)).isoformat()


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


async def _get_gpu_type_id_by_name(name: str) -> int:
    """Return a GPU type ID by name."""

    async with async_session_factory() as session:
        result = await session.execute(select(GpuType).where(GpuType.name == name))
        gpu_type = result.scalar_one()
        return gpu_type.id


async def _insert_booking(
    *,
    user_email: str,
    gpu_type_id: int,
    gram_option_id: int,
    memory_option_id: int,
    workflow_type_id: int,
    start_date: date,
    end_date: date,
    status: BookingStatus = BookingStatus.unconfirmed,
    admin_notes: str | None = None,
) -> None:
    """Insert a booking record for list endpoint scenarios."""

    async with async_session_factory() as session:
        session.add(
            Booking(
                user_email=user_email,
                gpu_type_id=gpu_type_id,
                gpu_count=1,
                gram_option_id=gram_option_id,
                memory_option_id=memory_option_id,
                workflow_type_id=workflow_type_id,
                start_date=start_date,
                end_date=end_date,
                status=status,
                admin_notes=admin_notes,
            )
        )
        await session.commit()


@pytest.mark.anyio
async def test_list_bookings_returns_all_items_without_filters() -> None:
    """Return all bookings when no list filters are provided."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()

    for offset in range(5):
        await _insert_booking(
            user_email=f"user{offset}@example.com",
            gpu_type_id=gpu_type_id,
            gram_option_id=gram_option_id,
            memory_option_id=memory_option_id,
            workflow_type_id=workflow_type_id,
            start_date=date(2026, 3, 1 + offset),
            end_date=date(2026, 3, 2 + offset),
        )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/bookings")

    assert response.status_code == 200
    assert len(response.json()) == 5


@pytest.mark.anyio
async def test_list_bookings_filters_by_date_overlap() -> None:
    """Return only bookings that overlap the requested date range."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()

    overlapping_windows = [
        (date(2026, 2, 27), date(2026, 3, 3)),
        (date(2026, 3, 5), date(2026, 3, 7)),
        (date(2026, 3, 15), date(2026, 3, 20)),
    ]
    non_overlapping_windows = [
        (date(2026, 2, 1), date(2026, 2, 15)),
        (date(2026, 3, 16), date(2026, 3, 25)),
    ]

    for index, (start, end) in enumerate(overlapping_windows):
        await _insert_booking(
            user_email=f"overlap{index}@example.com",
            gpu_type_id=gpu_type_id,
            gram_option_id=gram_option_id,
            memory_option_id=memory_option_id,
            workflow_type_id=workflow_type_id,
            start_date=start,
            end_date=end,
        )

    for index, (start, end) in enumerate(non_overlapping_windows):
        await _insert_booking(
            user_email=f"outside{index}@example.com",
            gpu_type_id=gpu_type_id,
            gram_option_id=gram_option_id,
            memory_option_id=memory_option_id,
            workflow_type_id=workflow_type_id,
            start_date=start,
            end_date=end,
        )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/bookings",
            params={"start_date": "2026-03-01", "end_date": "2026-03-15"},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    assert {item["user_email"] for item in body} == {
        "overlap0@example.com",
        "overlap1@example.com",
        "overlap2@example.com",
    }


@pytest.mark.anyio
async def test_list_bookings_filters_by_gpu_type_id() -> None:
    """Return only bookings matching the requested GPU type."""

    (
        h100_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    a100_id = await _get_gpu_type_id_by_name("A100")

    await _insert_booking(
        user_email="h100@example.com",
        gpu_type_id=h100_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 2),
        end_date=date(2026, 3, 4),
    )
    await _insert_booking(
        user_email="a100@example.com",
        gpu_type_id=a100_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 2),
        end_date=date(2026, 3, 4),
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/bookings",
            params={"gpu_type_id": h100_id},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["gpu_type_id"] == h100_id
    assert body[0]["user_email"] == "h100@example.com"


@pytest.mark.anyio
async def test_list_bookings_filters_by_status() -> None:
    """Return only bookings matching the requested booking status."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()

    await _insert_booking(
        user_email="confirmed@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 10),
        end_date=date(2026, 3, 11),
        status=BookingStatus.confirmed,
    )
    await _insert_booking(
        user_email="tentative@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 10),
        end_date=date(2026, 3, 11),
        status=BookingStatus.tentative,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/bookings",
            params={"status": "confirmed"},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["status"] == BookingStatus.confirmed
    assert body[0]["user_email"] == "confirmed@example.com"


@pytest.mark.anyio
async def test_list_bookings_hides_admin_notes_for_non_admin_user() -> None:
    """Redact admin notes for non-admin users."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()

    await _insert_booking(
        user_email="owner@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 8),
        end_date=date(2026, 3, 9),
        admin_notes="sensitive note",
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/bookings",
            headers={"X-Dev-User": "non-admin@example.com"},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["admin_notes"] is None


@pytest.mark.anyio
async def test_list_bookings_shows_admin_notes_for_admin_user() -> None:
    """Expose admin notes for admin users."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()

    async with async_session_factory() as session:
        session.add(Admin(email="admin@example.com"))
        await session.commit()

    await _insert_booking(
        user_email="owner@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 8),
        end_date=date(2026, 3, 9),
        admin_notes="visible admin note",
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/bookings",
            headers={"X-Dev-User": "admin@example.com"},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["admin_notes"] == "visible admin note"


@pytest.mark.anyio
async def test_create_booking_returns_201_with_unconfirmed_status_and_no_warnings() -> (
    None
):
    """Create a valid booking and return an empty warnings list."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 4,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": _date_string(30),
        "end_date": _date_string(33),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "unconfirmed"
    assert body["warnings"] == []


@pytest.mark.anyio
async def test_create_booking_rejects_start_date_in_past() -> None:
    """Reject creation when start date is before today."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 1,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": _date_string(-1),
        "end_date": _date_string(5),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 400
    assert response.json() == {"detail": "Start date must be in the future"}


@pytest.mark.anyio
async def test_create_booking_rejects_start_date_after_end_date() -> None:
    """Reject creation when start date is after end date."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 1,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": _date_string(10),
        "end_date": _date_string(9),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 400
    assert response.json() == {"detail": "Start date must be before end date"}


@pytest.mark.anyio
async def test_create_booking_rejects_unknown_gpu_type() -> None:
    """Reject creation when GPU type does not exist."""

    _, gram_option_id, memory_option_id, workflow_type_id = await _get_reference_ids()
    payload = {
        "gpu_type_id": 999999,
        "gpu_count": 1,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": _date_string(20),
        "end_date": _date_string(20),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 404
    assert response.json() == {"detail": "GPU type not found"}


@pytest.mark.anyio
async def test_create_booking_returns_duration_warning_for_15_day_booking() -> None:
    """Return a warning when duration exceeds 14 days."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 1,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": _date_string(30),
        "end_date": _date_string(44),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 201
    assert any("14-day" in warning for warning in response.json()["warnings"])


@pytest.mark.anyio
async def test_create_booking_returns_advance_notice_warning_under_14_days() -> None:
    """Return a warning when advance notice is less than 2 weeks."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 1,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": _date_string(5),
        "end_date": _date_string(6),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 201
    assert any("2 weeks" in warning for warning in response.json()["warnings"])


@pytest.mark.anyio
async def test_create_booking_returns_409_when_100_percent_capacity_exceeded() -> None:
    """Return conflict when booking exceeds confirmed GPU capacity."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    target_day = date.today() + timedelta(days=30)

    async with async_session_factory() as session:
        gpu_type = await session.get(GpuType, gpu_type_id)
        assert gpu_type is not None
        gpu_type.total_count = 40
        session.add(
            Booking(
                user_email="existing@example.com",
                gpu_type_id=gpu_type_id,
                gpu_count=38,
                gram_option_id=gram_option_id,
                memory_option_id=memory_option_id,
                workflow_type_id=workflow_type_id,
                start_date=target_day,
                end_date=target_day,
                status=BookingStatus.confirmed,
            )
        )
        await session.commit()

    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 3,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": target_day.isoformat(),
        "end_date": target_day.isoformat(),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 409
    assert "100%" in response.json()["detail"]


@pytest.mark.anyio
async def test_create_booking_returns_40_percent_warning_when_user_exceeds_limit() -> (
    None
):
    """Return warning when user exceeds 40% of grand total capacity."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    target_day = date.today() + timedelta(days=30)
    request_user = "capacity-user@example.com"

    async with async_session_factory() as session:
        gpu_type = await session.get(GpuType, gpu_type_id)
        assert gpu_type is not None
        gpu_type.total_count = 40

        other_gpu_types = await session.execute(
            select(GpuType).where(GpuType.id != gpu_type_id)
        )
        for other_gpu_type in other_gpu_types.scalars().all():
            other_gpu_type.total_count = 0

        session.add(
            Booking(
                user_email=request_user,
                gpu_type_id=gpu_type_id,
                gpu_count=15,
                gram_option_id=gram_option_id,
                memory_option_id=memory_option_id,
                workflow_type_id=workflow_type_id,
                start_date=target_day,
                end_date=target_day,
                status=BookingStatus.confirmed,
            )
        )
        await session.commit()

    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 2,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": target_day.isoformat(),
        "end_date": target_day.isoformat(),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/bookings",
            json=payload,
            headers={"X-Dev-User": request_user},
        )

    assert response.status_code == 201
    assert any("40%" in warning for warning in response.json()["warnings"])


@pytest.mark.anyio
@pytest.mark.parametrize("gpu_count", [0, -1])
async def test_create_booking_returns_422_for_non_positive_gpu_count(
    gpu_count: int,
) -> None:
    """Reject payloads where gpu_count is zero or negative."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": gpu_count,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": _date_string(20),
        "end_date": _date_string(20),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 422


@pytest.mark.anyio
async def test_create_booking_returns_all_optional_fields() -> None:
    """Return optional booking fields unchanged when supplied."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 2,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": _date_string(30),
        "end_date": _date_string(31),
        "alt_email": "alt@example.com",
        "project_name": "Genome Alpha",
        "project_pi": "Dr Smith",
        "project_grant_number": "G-12345",
        "technical_lead": "Taylor",
        "event_start_date": _date_string(35),
        "event_end_date": _date_string(36),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["alt_email"] == payload["alt_email"]
    assert body["project_name"] == payload["project_name"]
    assert body["project_pi"] == payload["project_pi"]
    assert body["project_grant_number"] == payload["project_grant_number"]
    assert body["technical_lead"] == payload["technical_lead"]
    assert body["event_start_date"] == payload["event_start_date"]
    assert body["event_end_date"] == payload["event_end_date"]


@pytest.mark.anyio
async def test_create_booking_allows_single_day_booking() -> None:
    """Allow a single-day booking when start and end dates match."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    payload = {
        "gpu_type_id": gpu_type_id,
        "gpu_count": 1,
        "gram_option_id": gram_option_id,
        "memory_option_id": memory_option_id,
        "workflow_type_id": workflow_type_id,
        "start_date": _date_string(25),
        "end_date": _date_string(25),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/bookings", json=payload)

    assert response.status_code == 201


@pytest.mark.anyio
async def test_cancel_booking_owner_deletes_when_never_admin_edited() -> None:
    """Delete booking permanently when owner cancels a never-admin-edited booking."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()

    async with async_session_factory() as session:
        booking = Booking(
            user_email="a@b.com",
            gpu_type_id=gpu_type_id,
            gpu_count=1,
            gram_option_id=gram_option_id,
            memory_option_id=memory_option_id,
            workflow_type_id=workflow_type_id,
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=22),
            status=BookingStatus.unconfirmed,
            admin_modified_at=None,
        )
        session.add(booking)
        await session.commit()
        await session.refresh(booking)
        booking_id = booking.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete(
            f"/api/v1/bookings/{booking_id}",
            headers={"X-Dev-User": "a@b.com"},
        )

    assert response.status_code == 200
    assert response.json()["id"] == booking_id

    async with async_session_factory() as session:
        deleted_booking = await session.get(Booking, booking_id)
    assert deleted_booking is None


@pytest.mark.anyio
async def test_cancel_booking_owner_sets_cancelled_when_admin_edited() -> None:
    """Set status to cancelled when owner cancels an admin-edited booking."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()

    async with async_session_factory() as session:
        booking = Booking(
            user_email="a@b.com",
            gpu_type_id=gpu_type_id,
            gpu_count=1,
            gram_option_id=gram_option_id,
            memory_option_id=memory_option_id,
            workflow_type_id=workflow_type_id,
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=22),
            status=BookingStatus.confirmed,
            admin_modified_by="admin@example.com",
            admin_modified_at=datetime.now(),
        )
        session.add(booking)
        await session.commit()
        await session.refresh(booking)
        booking_id = booking.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete(
            f"/api/v1/bookings/{booking_id}",
            headers={"X-Dev-User": "a@b.com"},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"

    async with async_session_factory() as session:
        updated_booking = await session.get(Booking, booking_id)
    assert updated_booking is not None
    assert updated_booking.status == BookingStatus.cancelled


@pytest.mark.anyio
async def test_cancel_booking_non_owner_non_admin_gets_403() -> None:
    """Return forbidden when a non-owner non-admin attempts cancellation."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()

    async with async_session_factory() as session:
        booking = Booking(
            user_email="a@b.com",
            gpu_type_id=gpu_type_id,
            gpu_count=1,
            gram_option_id=gram_option_id,
            memory_option_id=memory_option_id,
            workflow_type_id=workflow_type_id,
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=22),
            status=BookingStatus.confirmed,
        )
        session.add(booking)
        await session.commit()
        await session.refresh(booking)
        booking_id = booking.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete(
            f"/api/v1/bookings/{booking_id}",
            headers={"X-Dev-User": "other@b.com"},
        )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_cancel_booking_admin_sets_cancelled_for_admin_edited_booking() -> None:
    """Allow admin cancellation by setting status to cancelled."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    admin_email = settings.initial_admin_emails.split(",")[0].strip()

    async with async_session_factory() as session:
        booking = Booking(
            user_email="owner@b.com",
            gpu_type_id=gpu_type_id,
            gpu_count=1,
            gram_option_id=gram_option_id,
            memory_option_id=memory_option_id,
            workflow_type_id=workflow_type_id,
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=22),
            status=BookingStatus.confirmed,
            admin_modified_by=admin_email,
            admin_modified_at=datetime.now(),
        )
        session.add(booking)
        await session.commit()
        await session.refresh(booking)
        booking_id = booking.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete(
            f"/api/v1/bookings/{booking_id}",
            headers={"X-Dev-User": admin_email},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


@pytest.mark.anyio
async def test_cancel_booking_returns_404_for_missing_booking() -> None:
    """Return not found when the booking does not exist."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete(
            "/api/v1/bookings/999",
            headers={"X-Dev-User": "a@b.com"},
        )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_cancel_booking_admin_sets_cancelled_when_not_admin_edited() -> None:
    """Ensure admin cancellation always sets cancelled even if never admin-edited."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    admin_email = settings.initial_admin_emails.split(",")[0].strip()

    async with async_session_factory() as session:
        booking = Booking(
            user_email="owner@b.com",
            gpu_type_id=gpu_type_id,
            gpu_count=1,
            gram_option_id=gram_option_id,
            memory_option_id=memory_option_id,
            workflow_type_id=workflow_type_id,
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=22),
            status=BookingStatus.confirmed,
            admin_modified_at=None,
        )
        session.add(booking)
        await session.commit()
        await session.refresh(booking)
        booking_id = booking.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete(
            f"/api/v1/bookings/{booking_id}",
            headers={"X-Dev-User": admin_email},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"

    async with async_session_factory() as session:
        updated_booking = await session.get(Booking, booking_id)
    assert updated_booking is not None
    assert updated_booking.status == BookingStatus.cancelled


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
