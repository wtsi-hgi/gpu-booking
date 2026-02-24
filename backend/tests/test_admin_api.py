"""Tests for admin and reference data API endpoints."""

from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from config import settings
from db.engine import async_session_factory, engine
from db.models import Base, Booking, GpuType, MemoryOption, WorkflowType
from db.seed import seed_db
from main import app


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
