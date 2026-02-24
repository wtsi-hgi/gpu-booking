"""Tests for authentication middleware dependencies."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from api.schemas import UserInfo
from db.models import Admin, Base
from middleware import auth as auth_middleware


@pytest.fixture
async def auth_session_factory(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """Provide an in-memory database for auth dependency tests."""

    engine: AsyncEngine = create_async_engine(
        "sqlite+aiosqlite://", poolclass=StaticPool
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    monkeypatch.setattr(auth_middleware, "async_session_factory", session_factory)
    yield session_factory

    await engine.dispose()


def _make_request(headers: dict[str, str] | None = None) -> Request:
    """Build a Starlette request with optional headers."""

    header_items = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/auth/me",
        "headers": header_items,
    }
    return Request(scope)


async def _add_admin(
    session_factory: async_sessionmaker[AsyncSession],
    email: str,
) -> None:
    """Insert one admin email row in the auth test database."""

    async with session_factory() as session:
        session.add(Admin(email=email))
        await session.commit()


@pytest.mark.anyio
async def test_get_current_user_insecure_without_header_uses_default_admin(
    monkeypatch: pytest.MonkeyPatch,
    auth_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Return default insecure user as admin when header is absent."""

    _ = auth_session_factory
    monkeypatch.setattr(auth_middleware.settings, "auth_mode", "insecure")
    monkeypatch.setattr(
        auth_middleware.settings,
        "initial_admin_emails",
        "first-admin@example.com,other@example.com",
    )

    user = await auth_middleware.get_current_user(_make_request())

    assert user == UserInfo(
        email="first-admin@example.com",
        is_admin=True,
        auth_mode="insecure",
    )


@pytest.mark.anyio
async def test_get_current_user_insecure_with_non_admin_header(
    monkeypatch: pytest.MonkeyPatch,
    auth_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Return non-admin user when insecure header email is not in admins table."""

    _ = auth_session_factory
    monkeypatch.setattr(auth_middleware.settings, "auth_mode", "insecure")

    user = await auth_middleware.get_current_user(
        _make_request({"X-Dev-User": "user@example.com"})
    )

    assert user == UserInfo(
        email="user@example.com",
        is_admin=False,
        auth_mode="insecure",
    )


@pytest.mark.anyio
async def test_get_current_user_insecure_with_admin_header(
    monkeypatch: pytest.MonkeyPatch,
    auth_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Return admin user when insecure header email exists in admins table."""

    monkeypatch.setattr(auth_middleware.settings, "auth_mode", "insecure")
    await _add_admin(auth_session_factory, "admin@example.com")

    user = await auth_middleware.get_current_user(
        _make_request({"X-Dev-User": "admin@example.com"})
    )

    assert user == UserInfo(
        email="admin@example.com",
        is_admin=True,
        auth_mode="insecure",
    )


@pytest.mark.anyio
async def test_require_admin_raises_for_non_admin() -> None:
    """Raise HTTP 403 when user is not an administrator."""

    user = UserInfo(email="user@example.com", is_admin=False, auth_mode="insecure")

    with pytest.raises(HTTPException) as error:
        await auth_middleware.require_admin(user)

    assert error.value.status_code == 403


@pytest.mark.anyio
async def test_require_admin_returns_admin_user() -> None:
    """Return user unchanged when user has admin privileges."""

    user = UserInfo(email="admin@example.com", is_admin=True, auth_mode="insecure")

    result = await auth_middleware.require_admin(user)

    assert result == user


@pytest.mark.anyio
async def test_get_current_user_oidc_without_authorization_header_raises_401(
    monkeypatch: pytest.MonkeyPatch,
    auth_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Raise HTTP 401 for OIDC mode requests that omit bearer tokens."""

    _ = auth_session_factory
    monkeypatch.setattr(auth_middleware.settings, "auth_mode", "oidc")

    with pytest.raises(HTTPException) as error:
        await auth_middleware.get_current_user(_make_request())

    assert error.value.status_code == 401
