"""Tests for health endpoint database connectivity checks."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from db.engine import get_session
from main import app


@pytest.mark.anyio
async def test_health_endpoint_reports_database_ok() -> None:
    """Return healthy status when the database connectivity check passes."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "ok"}


@pytest.mark.anyio
async def test_health_endpoint_returns_503_when_database_is_unreachable() -> None:
    """Return unhealthy status when the database connectivity check fails."""

    class FailingSession:
        async def execute(self, *_args: object, **_kwargs: object) -> None:
            raise RuntimeError("database unavailable")

    async def override_get_session():
        yield FailingSession()

    app.dependency_overrides[get_session] = override_get_session

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            response = await client.get("/api/v1/health")
    finally:
        app.dependency_overrides.pop(get_session, None)

    assert response.status_code == 503
    payload = response.json()
    assert payload["status"] == "unhealthy"
    assert payload["database"].startswith("error: ")
