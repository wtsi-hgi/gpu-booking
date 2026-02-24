"""Database seed utilities for baseline application data."""

from __future__ import annotations

import os

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Admin, GpuType, GramOption, MemoryOption, WorkflowType


async def _is_table_empty(session: AsyncSession, model: type) -> bool:
    """Return True when the given model's table has no rows."""

    result = await session.execute(select(func.count()).select_from(model))
    return result.scalar_one() == 0


def _parse_initial_admin_emails() -> list[str]:
    """Parse comma-separated INITIAL_ADMIN_EMAILS into normalized emails."""

    raw_value = os.getenv("INITIAL_ADMIN_EMAILS", "")
    return [email.strip() for email in raw_value.split(",") if email.strip()]


async def seed_db(session: AsyncSession) -> None:
    """Seed initial data if tables are empty.

    Only seeds each table if it has zero rows, making it idempotent
    across restarts.
    """

    if await _is_table_empty(session, GpuType):
        session.add_all(
            [
                GpuType(
                    name="H200",
                    gram_gb=141,
                    system_memory_gb=1000,
                    total_count=24,
                ),
                GpuType(name="H100", gram_gb=80, system_memory_gb=500, total_count=16),
                GpuType(name="A100", gram_gb=80, system_memory_gb=500, total_count=0),
                GpuType(name="V100", gram_gb=32, system_memory_gb=192, total_count=0),
            ]
        )

    if await _is_table_empty(session, WorkflowType):
        session.add_all(
            [
                WorkflowType(name="Inference workloads"),
                WorkflowType(name="Interactive workloads"),
                WorkflowType(name="HPC training, one server per task/job"),
                WorkflowType(
                    name="At scale training, span multiple GPU servers (> 8 GPUs)"
                ),
            ]
        )

    if await _is_table_empty(session, GramOption):
        session.add_all(
            [
                GramOption(label="80GB", value_gb=80, sort_order=1),
                GramOption(label="60GB", value_gb=60, sort_order=2),
                GramOption(label="40GB", value_gb=40, sort_order=3),
                GramOption(label="<=20GB", value_gb=20, sort_order=4),
            ]
        )

    if await _is_table_empty(session, MemoryOption):
        session.add_all(
            [
                MemoryOption(label="500GB", value_gb=500, sort_order=1),
                MemoryOption(label="100GB", value_gb=100, sort_order=2),
                MemoryOption(label="56GB", value_gb=56, sort_order=3),
                MemoryOption(label="50GB", value_gb=50, sort_order=4),
                MemoryOption(label="25GB", value_gb=25, sort_order=5),
                MemoryOption(label="10GB", value_gb=10, sort_order=6),
                MemoryOption(label="<10GB", value_gb=5, sort_order=7),
            ]
        )

    if await _is_table_empty(session, Admin):
        admin_emails = _parse_initial_admin_emails()
        session.add_all([Admin(email=email) for email in admin_emails])

    await session.commit()
