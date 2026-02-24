"""Tests for admin and reference data API endpoints."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

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


def _default_admin_email() -> str:
    """Return the default insecure-mode admin email used by tests."""

    configured = [
        email.strip()
        for email in settings.initial_admin_emails.split(",")
        if email.strip()
    ]
    return configured[0] if configured else "dev@example.com"


async def _get_reference_ids() -> tuple[int, int, int, int]:
    """Return seeded reference IDs required for booking records."""

    async with async_session_factory() as session:
        gpu_type = await session.get(GpuType, 1)
        gram_option = await session.get(GramOption, 1)
        memory_option = await session.get(MemoryOption, 1)
        workflow_type = await session.get(WorkflowType, 1)

        assert gpu_type is not None
        assert gram_option is not None
        assert memory_option is not None
        assert workflow_type is not None

        return gpu_type.id, gram_option.id, memory_option.id, workflow_type.id


async def _insert_booking(
    *,
    user_email: str,
    gpu_type_id: int,
    gram_option_id: int,
    memory_option_id: int,
    workflow_type_id: int,
    start_date: date,
    end_date: date,
    gpu_count: int = 1,
    status: BookingStatus = BookingStatus.unconfirmed,
    admin_notes: str | None = None,
) -> Booking:
    """Insert a booking record and return the persisted ORM object."""

    async with async_session_factory() as session:
        booking = Booking(
            user_email=user_email,
            gpu_type_id=gpu_type_id,
            gpu_count=gpu_count,
            gram_option_id=gram_option_id,
            memory_option_id=memory_option_id,
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
async def test_get_gpu_types_returns_seeded_data_for_any_user() -> None:
    """Return all seeded GPU types on the public endpoint."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/gpu-types")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 4
    assert {
        "id",
        "name",
        "gram_gb",
        "system_memory_gb",
        "total_count",
        "created_at",
        "updated_at",
    }.issubset(payload[0].keys())


@pytest.mark.anyio
async def test_post_admin_gpu_types_creates_record_for_admin() -> None:
    """Create a GPU type for admin-authenticated users."""

    new_gpu = {
        "name": "H200-phase3-admin-test",
        "gram_gb": 141,
        "system_memory_gb": 1000,
        "total_count": 60,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/admin/gpu-types", json=new_gpu)

    assert response.status_code == 201
    payload = response.json()
    assert payload["id"] > 0
    assert payload["name"] == new_gpu["name"]


@pytest.mark.anyio
async def test_put_admin_gpu_types_updates_total_count() -> None:
    """Update GPU type fields for admin-authenticated users."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.put(
            "/api/v1/admin/gpu-types/1", json={"total_count": 50}
        )

    assert response.status_code == 200
    assert response.json()["total_count"] == 50


@pytest.mark.anyio
async def test_post_admin_gpu_types_forbidden_for_non_admin() -> None:
    """Reject create requests from non-admin users."""

    payload = {
        "name": "L40S-phase3-forbidden",
        "gram_gb": 48,
        "system_memory_gb": 256,
        "total_count": 4,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/admin/gpu-types",
            json=payload,
            headers={"X-Dev-User": "non-admin-phase3@example.com"},
        )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_post_admin_gpu_types_duplicate_name_returns_conflict() -> None:
    """Return 409 when GPU type name already exists."""

    payload = {
        "name": "H100",
        "gram_gb": 80,
        "system_memory_gb": 500,
        "total_count": 42,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/admin/gpu-types", json=payload)

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

    async with async_session_factory() as session:
        result = await session.get(WorkflowType, 1)
        workflow_id = 1 if result is not None else None
        if workflow_id is None:
            workflow = WorkflowType(name="In-use-phase3-workflow")
            session.add(workflow)
            await session.commit()
            await session.refresh(workflow)
            workflow_id = workflow.id

        booking = Booking(
            user_email="workflow-in-use@example.com",
            gpu_type_id=1,
            gpu_count=1,
            gram_option_id=1,
            memory_option_id=1,
            workflow_type_id=workflow_id,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 2),
        )
        session.add(booking)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete(f"/api/v1/admin/workflow-types/{workflow_id}")

    assert response.status_code == 409


@pytest.mark.anyio
async def test_gram_options_public_ordering_and_admin_create_delete_behaviour() -> None:
    """Enforce ordering and in-use deletion conflict for GRAM options."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        list_response = await client.get("/api/v1/gram-options")
        assert list_response.status_code == 200
        listed = list_response.json()
        assert len(listed) == 4
        sort_orders = [item["sort_order"] for item in listed]
        assert sort_orders == sorted(sort_orders)

        create_response = await client.post(
            "/api/v1/admin/gram-options",
            json={"label": "160GB-phase3", "value_gb": 160, "sort_order": 0},
        )
        assert create_response.status_code == 201
        created_id = create_response.json()["id"]

        delete_response = await client.delete(
            f"/api/v1/admin/gram-options/{created_id}"
        )
        assert delete_response.status_code == 204


@pytest.mark.anyio
async def test_gram_option_delete_returns_conflict_when_in_use() -> None:
    """Reject GRAM option deletion when in use by bookings."""

    async with async_session_factory() as session:
        booking = Booking(
            user_email="gram-in-use@example.com",
            gpu_type_id=1,
            gpu_count=1,
            gram_option_id=1,
            memory_option_id=1,
            workflow_type_id=1,
            start_date=date(2026, 3, 3),
            end_date=date(2026, 3, 4),
        )
        session.add(booking)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete("/api/v1/admin/gram-options/1")

    assert response.status_code == 409


@pytest.mark.anyio
async def test_memory_options_public_ordering_and_admin_create_delete_behaviour() -> (
    None
):
    """Enforce ordering and deletion behaviour for memory options."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        list_response = await client.get("/api/v1/memory-options")
        assert list_response.status_code == 200
        listed = list_response.json()
        assert len(listed) == 7
        sort_orders = [item["sort_order"] for item in listed]
        assert sort_orders == sorted(sort_orders)

        create_response = await client.post(
            "/api/v1/admin/memory-options",
            json={"label": "1TB-phase3", "value_gb": 1000, "sort_order": 0},
        )
        assert create_response.status_code == 201
        created_id = create_response.json()["id"]

        delete_response = await client.delete(
            f"/api/v1/admin/memory-options/{created_id}"
        )
        assert delete_response.status_code == 204


@pytest.mark.anyio
async def test_memory_option_delete_returns_conflict_when_in_use() -> None:
    """Reject memory option deletion when in use by bookings."""

    async with async_session_factory() as session:
        if await session.get(MemoryOption, 1) is None:
            memory_option = MemoryOption(label="500GB", value_gb=500, sort_order=1)
            session.add(memory_option)
        if await session.get(GpuType, 1) is None:
            session.add(
                GpuType(
                    name="H100-phase3-memory",
                    gram_gb=80,
                    system_memory_gb=500,
                    total_count=8,
                )
            )
        await session.commit()

        booking = Booking(
            user_email="memory-in-use@example.com",
            gpu_type_id=1,
            gpu_count=1,
            gram_option_id=1,
            memory_option_id=1,
            workflow_type_id=1,
            start_date=date(2026, 3, 5),
            end_date=date(2026, 3, 6),
        )
        session.add(booking)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete("/api/v1/admin/memory-options/1")

    assert response.status_code == 409


@pytest.mark.anyio
async def test_patch_admin_booking_sets_confirmed_and_admin_modified_fields() -> None:
    """Confirm an unconfirmed booking and stamp admin metadata."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
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

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
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

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    async with async_session_factory() as session:
        gpu_type = await session.get(GpuType, gpu_type_id)
        assert gpu_type is not None
        gpu_type.total_count = 1
        await session.commit()

    start_date = date.today() + timedelta(days=40)
    end_date = date.today() + timedelta(days=41)
    await _insert_booking(
        user_email="confirmed@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=start_date,
        end_date=end_date,
        gpu_count=1,
        status=BookingStatus.confirmed,
    )
    target = await _insert_booking(
        user_email="target@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=start_date,
        end_date=end_date,
        gpu_count=1,
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

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    async with async_session_factory() as session:
        gpu_type = await session.get(GpuType, gpu_type_id)
        assert gpu_type is not None
        gpu_type.total_count = 4
        await session.commit()

    start_date = date.today() + timedelta(days=45)
    end_date = date.today() + timedelta(days=45)
    await _insert_booking(
        user_email="full@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=start_date,
        end_date=end_date,
        gpu_count=4,
        status=BookingStatus.confirmed,
    )
    target = await _insert_booking(
        user_email="target@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=start_date,
        end_date=end_date,
        gpu_count=1,
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

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
        workflow_type_id=workflow_type_id,
        start_date=date.today() + timedelta(days=50),
        end_date=date.today() + timedelta(days=52),
        gpu_count=2,
        status=BookingStatus.unconfirmed,
    )

    new_start = date.today() + timedelta(days=60)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}",
            json={"gpu_count": 10, "start_date": new_start.isoformat()},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["gpu_count"] == 10
    assert payload["start_date"] == new_start.isoformat()


@pytest.mark.anyio
async def test_patch_admin_booking_forbidden_for_non_admin_user() -> None:
    """Reject booking updates from non-admin users."""

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
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

    (
        gpu_type_id,
        gram_option_id,
        memory_option_id,
        workflow_type_id,
    ) = await _get_reference_ids()
    booking = await _insert_booking(
        user_email="owner@example.com",
        gpu_type_id=gpu_type_id,
        gram_option_id=gram_option_id,
        memory_option_id=memory_option_id,
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
