"""Database seed utilities for baseline application data."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.models import Admin, GpuHostType, WorkflowType


async def _is_table_empty(session: AsyncSession, model: type) -> bool:
    """Return True when the given model's table has no rows."""

    result = await session.execute(select(func.count()).select_from(model))
    return result.scalar_one() == 0


def _parse_initial_admin_emails() -> list[str]:
    """Parse comma-separated INITIAL_ADMIN_EMAILS into normalized emails."""

    raw_value = settings.initial_admin_emails
    return [email.strip() for email in raw_value.split(",") if email.strip()]


async def seed_db(session: AsyncSession) -> None:
    """Seed initial data if tables are empty.

    Only seeds each table if it has zero rows, making it idempotent
    across restarts.
    """

    if await _is_table_empty(session, GpuHostType):
        session.add_all(
            [
                GpuHostType(gpu_type="H200", gpu_count=8, total_count=3),
                GpuHostType(gpu_type="H100", gpu_count=8, total_count=2),
                GpuHostType(gpu_type="A100", gpu_count=8, total_count=0),
                GpuHostType(gpu_type="V100", gpu_count=8, total_count=0),
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

    if await _is_table_empty(session, Admin):
        admin_emails = _parse_initial_admin_emails()
        session.add_all([Admin(email=email) for email in admin_emails])

    await session.commit()
