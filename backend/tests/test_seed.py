"""Tests for database seeding logic."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from config import settings
from db.models import Admin, Base, GpuHostType, WorkflowType
from db.seed import seed_db


@pytest.fixture
async def db_session() -> AsyncSession:
    """Yield an async session backed by an in-memory SQLite database."""

    engine: AsyncEngine = create_async_engine(
        "sqlite+aiosqlite://", poolclass=StaticPool
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.mark.anyio
async def test_seed_db_populates_gpu_host_types_with_expected_values(
    db_session: AsyncSession,
) -> None:
    await seed_db(db_session)

    result = await db_session.execute(
        select(GpuHostType).order_by(GpuHostType.gpu_type)
    )
    rows = result.scalars().all()

    assert len(rows) == 4
    assert [(row.gpu_type, row.gpu_count, row.total_count) for row in rows] == [
        ("A100", 8, 0),
        ("H100", 8, 2),
        ("H200", 8, 3),
        ("V100", 8, 0),
    ]


@pytest.mark.anyio
async def test_seed_db_populates_workflow_types_with_expected_values(
    db_session: AsyncSession,
) -> None:
    await seed_db(db_session)

    result = await db_session.execute(select(WorkflowType).order_by(WorkflowType.id))
    rows = result.scalars().all()

    assert len(rows) == 4
    assert [row.name for row in rows] == [
        "Inference workloads",
        "Interactive workloads",
        "HPC training, one server per task/job",
        "At scale training, span multiple GPU servers (> 8 GPUs)",
    ]


@pytest.mark.anyio
async def test_seed_db_populates_admins_from_env_var(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        settings,
        "initial_admin_emails",
        "admin@example.com,boss@example.com",
    )

    await seed_db(db_session)

    result = await db_session.execute(select(Admin).order_by(Admin.email))
    rows = result.scalars().all()

    assert len(rows) == 2
    assert [row.email for row in rows] == ["admin@example.com", "boss@example.com"]


@pytest.mark.anyio
async def test_seed_db_is_idempotent_when_gpu_host_types_already_exist(
    db_session: AsyncSession,
) -> None:
    await seed_db(db_session)
    await seed_db(db_session)

    result = await db_session.execute(select(GpuHostType))
    rows = result.scalars().all()

    assert len(rows) == 4


@pytest.mark.anyio
async def test_seed_db_without_admin_env_var_creates_no_admins(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "initial_admin_emails", "")

    await seed_db(db_session)

    result = await db_session.execute(select(Admin))
    rows = result.scalars().all()

    assert rows == []
