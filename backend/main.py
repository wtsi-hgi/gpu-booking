"""FastAPI application entry point with structured lifespan management."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from httpx import AsyncClient

from api import api_v1_router
from config import settings
from db.engine import async_session_factory, init_db
from db.seed import seed_db
from logging_config import setup_logging
from middleware.request_context import RequestContextMiddleware

logger = logging.getLogger("gpu_booking.api")


def configure_logging() -> None:
    """Ensure loggers emit structured, leveled messages."""

    setup_logging(settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context manager for startup/shutdown events."""

    configure_logging()
    logger.info(
        "Starting %s", settings.app_name, extra={"version": settings.app_version}
    )
    await init_db()
    async with async_session_factory() as session:
        await seed_db(session)

    app.state.http_client = AsyncClient(timeout=settings.http_client_timeout)

    try:
        yield
    finally:
        http_client: AsyncClient = app.state.http_client
        await http_client.aclose()
        logger.info("Shutting down application")


app = FastAPI(
    title=settings.app_name,
    description=settings.app_description,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(RequestContextMiddleware)


# Mount versioned API router
app.include_router(api_v1_router, prefix="/api/v1")
