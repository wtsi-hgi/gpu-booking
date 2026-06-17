"""Tests for admin and reference data API endpoints."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from config import settings
from db.engine import async_session_factory, engine
from db.models import Base, Booking, BookingStatus, GpuHostType, WorkflowType
from db.seed import seed_db
from main import app


def _default_admin_email() -> str:
    """Return the default insecure-mode admin email used by tests."""

    configured = [
        email.strip()
        for email in settings.initial_admin_emails.split(",")
        if email.strip()
    ]
    return configured[0] if configured else "dev@example.com"


async def _get_reference_ids() -> tuple[int, int]:
    """Return seeded reference IDs required for booking records."""

    async with async_session_factory() as session:
        host_type = await session.get(GpuHostType, 1)
        workflow_type = await session.get(WorkflowType, 1)

        assert host_type is not None
        assert workflow_type is not None

        return host_type.id, workflow_type.id


async def _insert_booking(
    *,
    user_email: str,
    gpu_host_type_id: int,
    workflow_type_id: int,
    start_date: date,
    end_date: date,
    host_count: int = 1,
    status: BookingStatus = BookingStatus.unconfirmed,
    admin_notes: str | None = None,
) -> Booking:
    """Insert a booking record and return the persisted ORM object."""

    async with async_session_factory() as session:
        booking = Booking(
            user_email=user_email,
            gpu_host_type_id=gpu_host_type_id,
            host_count=host_count,
            workflow_type_id=workflow_type_id,
            start_date=start_date,
            end_date=end_date,
            status=status,
            admin_notes=admin_notes,
        )
        session.add(booking)
        await session.commit()
        await session.refresh(booking)
        return booking


@pytest.mark.anyio
async def test_get_gpu_host_types_returns_seeded_data_for_any_user() -> None:
    """Return all seeded GPU host types on the public endpoint."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/gpu-host-types")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 4
    assert {
        "id",
        "gpu_type",
        "gpu_count",
        "total_count",
        "created_at",
        "updated_at",
    }.issubset(payload[0].keys())


@pytest.mark.anyio
async def test_post_admin_gpu_host_types_creates_record_for_admin() -> None:
    """Create a GPU host type for admin-authenticated users."""

    new_host_type = {
        "gpu_type": "L40S-phase3-admin-test",
        "gpu_count": 4,
        "total_count": 3,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/admin/gpu-host-types", json=new_host_type)

    assert response.status_code == 201
    payload = response.json()
    assert payload["id"] > 0
    assert payload["gpu_type"] == new_host_type["gpu_type"]
    assert payload["gpu_count"] == 4


@pytest.mark.anyio
async def test_put_admin_gpu_host_types_updates_total_count() -> None:
    """Update GPU host type fields for admin-authenticated users."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.put(
            "/api/v1/admin/gpu-host-types/1", json={"total_count": 5}
        )

    assert response.status_code == 200
    assert response.json()["total_count"] == 5


@pytest.mark.anyio
async def test_post_admin_gpu_host_types_forbidden_for_non_admin() -> None:
    """Reject create requests from non-admin users."""

    payload = {
        "gpu_type": "L40S-phase3-forbidden",
        "gpu_count": 4,
        "total_count": 2,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/admin/gpu-host-types",
            json=payload,
            headers={"X-Dev-User": "non-admin-phase3@example.com"},
        )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_post_admin_gpu_host_types_duplicate_shape_returns_conflict() -> None:
    """Return 409 when a GPU host type shape already exists."""

    payload = {
        "gpu_type": "H100",
        "gpu_count": 8,
        "total_count": 4,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/admin/gpu-host-types", json=payload)

    assert response.status_code == 409


@pytest.mark.anyio
async def test_get_workflow_types_returns_seeded_data() -> None:
    """Return all seeded workflow types on the public endpoint."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/workflow-types")

    assert response.status_code == 200
    assert len(response.json()) == 4


@pytest.mark.anyio
async def test_admin_workflow_type_crud_and_non_admin_forbidden() -> None:
    """Create and update workflow types for admins; forbid non-admin create."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        create_response = await client.post(
            "/api/v1/admin/workflow-types", json={"name": "Fine-tuning-phase3"}
        )
        assert create_response.status_code == 201
        workflow_id = create_response.json()["id"]

        update_response = await client.put(
            f"/api/v1/admin/workflow-types/{workflow_id}",
            json={"name": "Fine-tuning (GPU)-phase3"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["name"] == "Fine-tuning (GPU)-phase3"

        forbidden_response = await client.post(
            "/api/v1/admin/workflow-types",
            json={"name": "Should-not-create"},
            headers={"X-Dev-User": "non-admin-workflow@example.com"},
        )
        assert forbidden_response.status_code == 403


@pytest.mark.anyio
async def test_admin_workflow_delete_returns_no_content_when_not_in_use() -> None:
    """Delete unreferenced workflow types successfully."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        create_response = await client.post(
            "/api/v1/admin/workflow-types", json={"name": "To-delete-phase3"}
        )
        workflow_id = create_response.json()["id"]

        delete_response = await client.delete(
            f"/api/v1/admin/workflow-types/{workflow_id}"
        )

    assert delete_response.status_code == 204


@pytest.mark.anyio
async def test_admin_workflow_delete_returns_conflict_when_in_use() -> None:
    """Reject workflow deletion when a booking references it."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    await _insert_booking(
        user_email="workflow-in-use@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 2),
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete(
            f"/api/v1/admin/workflow-types/{workflow_type_id}"
        )

    assert response.status_code == 409


@pytest.mark.anyio
async def test_patch_admin_booking_sets_confirmed_and_admin_modified_fields() -> None:
    """Confirm an unconfirmed booking and stamp admin metadata."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=date.today() + timedelta(days=30),
        end_date=date.today() + timedelta(days=32),
        status=BookingStatus.unconfirmed,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}",
            json={"status": "confirmed"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "confirmed"
    assert payload["admin_modified_by"] == _default_admin_email()
    assert payload["admin_modified_at"] is not None


@pytest.mark.anyio
async def test_patch_admin_booking_updates_notes_and_admin_metadata() -> None:
    """Update admin_notes and stamp admin metadata."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=date.today() + timedelta(days=35),
        end_date=date.today() + timedelta(days=37),
        status=BookingStatus.unconfirmed,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}",
            json={"admin_notes": "Approved per PI agreement"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["admin_notes"] == "Approved per PI agreement"
    assert payload["admin_modified_by"] == _default_admin_email()
    assert payload["admin_modified_at"] is not None


@pytest.mark.anyio
async def test_patch_admin_booking_allows_rejected_status_even_if_capacity_full() -> (
    None
):
    """Allow rejected status updates regardless of capacity."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    async with async_session_factory() as session:
        host_type = await session.get(GpuHostType, host_type_id)
        assert host_type is not None
        host_type.total_count = 1
        await session.commit()

    start_date = date.today() + timedelta(days=40)
    end_date = date.today() + timedelta(days=41)
    await _insert_booking(
        user_email="confirmed@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=start_date,
        end_date=end_date,
        host_count=1,
        status=BookingStatus.confirmed,
    )
    target = await _insert_booking(
        user_email="target@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=start_date,
        end_date=end_date,
        host_count=1,
        status=BookingStatus.unconfirmed,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            f"/api/v1/admin/bookings/{target.id}",
            json={"status": "rejected"},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"


@pytest.mark.anyio
async def test_patch_admin_booking_returns_conflict_when_confirm_exceeds_capacity() -> (
    None
):
    """Return 409 when a consuming status update exceeds capacity."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    async with async_session_factory() as session:
        host_type = await session.get(GpuHostType, host_type_id)
        assert host_type is not None
        host_type.total_count = 2
        await session.commit()

    start_date = date.today() + timedelta(days=45)
    end_date = date.today() + timedelta(days=45)
    await _insert_booking(
        user_email="full@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=start_date,
        end_date=end_date,
        host_count=2,
        status=BookingStatus.confirmed,
    )
    target = await _insert_booking(
        user_email="target@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=start_date,
        end_date=end_date,
        host_count=1,
        status=BookingStatus.unconfirmed,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            f"/api/v1/admin/bookings/{target.id}",
            json={"status": "confirmed"},
        )

    assert response.status_code == 409


@pytest.mark.anyio
async def test_patch_admin_booking_updates_booking_fields() -> None:
    """Update mutable booking fields from AdminBookingUpdate payload."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=date.today() + timedelta(days=50),
        end_date=date.today() + timedelta(days=52),
        host_count=1,
        status=BookingStatus.unconfirmed,
    )

    new_start = date.today() + timedelta(days=60)
    new_end = date.today() + timedelta(days=62)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}",
            json={
                "host_count": 2,
                "start_date": new_start.isoformat(),
                "end_date": new_end.isoformat(),
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["host_count"] == 2
    assert payload["start_date"] == new_start.isoformat()


@pytest.mark.anyio
async def test_patch_admin_booking_rejects_invalid_date_range() -> None:
    """Return 400 when admin update sets start_date after end_date."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=date.today() + timedelta(days=75),
        end_date=date.today() + timedelta(days=77),
        status=BookingStatus.unconfirmed,
    )

    invalid_start = date.today() + timedelta(days=90)
    invalid_end = date.today() + timedelta(days=89)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}",
            json={
                "start_date": invalid_start.isoformat(),
                "end_date": invalid_end.isoformat(),
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Start date must be before end date"


@pytest.mark.anyio
async def test_patch_admin_booking_forbidden_for_non_admin_user() -> None:
    """Reject booking updates from non-admin users."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=date.today() + timedelta(days=65),
        end_date=date.today() + timedelta(days=67),
        status=BookingStatus.unconfirmed,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}",
            json={"status": "confirmed"},
            headers={"X-Dev-User": "non-admin@example.com"},
        )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_patch_admin_booking_returns_not_found_for_missing_booking() -> None:
    """Return 404 when booking ID does not exist."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            "/api/v1/admin/bookings/999999",
            json={"status": "confirmed"},
        )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_patch_admin_booking_can_reactivate_cancelled_booking() -> None:
    """Allow admins to change cancelled bookings back to confirmed."""

    host_type_id, workflow_type_id = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_host_type_id=host_type_id,
        workflow_type_id=workflow_type_id,
        start_date=date.today() + timedelta(days=70),
        end_date=date.today() + timedelta(days=72),
        status=BookingStatus.cancelled,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}",
            json={"status": "confirmed"},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


@pytest.fixture(autouse=True)
def _force_insecure_auth_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure tests run in insecure auth mode for header-based auth behaviour."""

    monkeypatch.setattr(settings, "auth_mode", "insecure")


@pytest.fixture(autouse=True)
async def _reset_and_seed_database() -> None:
    """Reset database state and seed reference data before each test."""

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        await seed_db(session)
