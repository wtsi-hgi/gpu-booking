"""Async SQLAlchemy engine and session dependency configuration."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from config import settings
from db.models import Base


def _build_engine() -> AsyncEngine:
    """Build and return an async SQLAlchemy engine from settings."""

    engine_kwargs: dict[str, Any] = {"echo": False}
    if settings.database_url == "sqlite+aiosqlite://":
        engine_kwargs["poolclass"] = StaticPool

    return create_async_engine(settings.database_url, **engine_kwargs)


engine = _build_engine()
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    """Create all tables. Called during app lifespan startup."""

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session for FastAPI dependencies."""

    async with async_session_factory() as session:
        yield session
