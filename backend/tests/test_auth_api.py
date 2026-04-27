"""Tests for authentication API endpoints."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from config import settings
from main import app


@pytest.mark.anyio
async def test_get_auth_me_returns_default_insecure_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return default insecure user info when X-Dev-User header is missing."""

    monkeypatch.setattr(settings, "auth_mode", "insecure")
    monkeypatch.setattr(settings, "initial_admin_emails", "phase2-admin@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json() == {
        "email": "phase2-admin@example.com",
        "is_admin": True,
        "auth_mode": "insecure",
    }


@pytest.mark.anyio
async def test_get_auth_me_returns_non_admin_for_unknown_dev_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Return non-admin user info for insecure-mode impersonated non-admin email."""

    monkeypatch.setattr(settings, "auth_mode", "insecure")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/auth/me",
            headers={"X-Dev-User": "user@example.com"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "email": "user@example.com",
        "is_admin": False,
        "auth_mode": "insecure",
    }
