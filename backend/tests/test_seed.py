"""Tests for database seeding logic (A3)."""

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
from db.models import Admin, Base, GpuType, GramOption, MemoryOption, WorkflowType
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
async def test_seed_db_populates_gpu_types_with_expected_values(
    db_session: AsyncSession,
) -> None:
    await seed_db(db_session)

    result = await db_session.execute(select(GpuType).order_by(GpuType.name))
    rows = result.scalars().all()

    assert len(rows) == 4
    assert [
        (row.name, row.gram_gb, row.system_memory_gb, row.total_count) for row in rows
    ] == [
        ("A100", 80, 500, 0),
        ("H100", 80, 500, 16),
        ("H200", 141, 1000, 24),
        ("V100", 32, 192, 0),
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
async def test_seed_db_populates_gram_and_memory_options(
    db_session: AsyncSession,
) -> None:
    await seed_db(db_session)

    gram_result = await db_session.execute(
        select(GramOption).order_by(GramOption.sort_order)
    )
    gram_rows = gram_result.scalars().all()

    memory_result = await db_session.execute(
        select(MemoryOption).order_by(MemoryOption.sort_order)
    )
    memory_rows = memory_result.scalars().all()

    assert len(gram_rows) == 4
    assert [(row.label, row.value_gb, row.sort_order) for row in gram_rows] == [
        ("80GB", 80, 1),
        ("60GB", 60, 2),
        ("40GB", 40, 3),
        ("<=20GB", 20, 4),
    ]

    assert len(memory_rows) == 7
    assert [(row.label, row.value_gb, row.sort_order) for row in memory_rows] == [
        ("500GB", 500, 1),
        ("100GB", 100, 2),
        ("56GB", 56, 3),
        ("50GB", 50, 4),
        ("25GB", 25, 5),
        ("10GB", 10, 6),
        ("<10GB", 5, 7),
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
async def test_seed_db_is_idempotent_when_gpu_types_already_exist(
    db_session: AsyncSession,
) -> None:
    await seed_db(db_session)
    await seed_db(db_session)

    result = await db_session.execute(select(GpuType))
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
