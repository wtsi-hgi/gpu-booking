"""Tests for database engine and session management."""

from __future__ import annotations

import importlib

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from config import Settings

engine_module = importlib.import_module("db.engine")


@pytest.fixture
async def in_memory_engine(monkeypatch: pytest.MonkeyPatch) -> AsyncEngine:
    """Configure db.engine globals to use a fresh in-memory SQLite engine."""

    test_engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    test_session_factory = async_sessionmaker(test_engine, expire_on_commit=False)

    monkeypatch.setattr(engine_module, "engine", test_engine)
    monkeypatch.setattr(engine_module, "async_session_factory", test_session_factory)

    yield test_engine
    await test_engine.dispose()


@pytest.mark.anyio
async def test_init_db_creates_all_tables(in_memory_engine) -> None:
    await engine_module.init_db()

    async with in_memory_engine.begin() as connection:
        table_names = await connection.run_sync(
            lambda sync_connection: set(
                sync_connection.dialect.get_table_names(sync_connection)
            )
        )

    assert {
        "admins",
        "gpu_host_types",
        "workflow_types",
        "bookings",
    }.issubset(table_names)


@pytest.mark.anyio
async def test_get_session_yields_queryable_and_closed_session(
    monkeypatch: pytest.MonkeyPatch,
    in_memory_engine,
) -> None:
    close_called = False
    original_close = AsyncSession.close

    async def tracking_close(self: AsyncSession) -> None:
        nonlocal close_called
        close_called = True
        await original_close(self)

    monkeypatch.setattr(AsyncSession, "close", tracking_close)

    await engine_module.init_db()

    dependency = engine_module.get_session()

    session = await anext(dependency)
    result = await session.execute(text("SELECT 1"))

    assert result.scalar_one() == 1
    assert session.is_active

    await dependency.aclose()

    assert close_called


def test_database_url_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("GPU_BOOKING_DATABASE_URL", raising=False)

    settings = Settings(_env_file=None)

    assert settings.database_url == "sqlite+aiosqlite:///./gpu_booking.db"
