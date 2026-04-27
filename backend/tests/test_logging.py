"""Tests for structured JSON logging and request context middleware."""

from __future__ import annotations

import asyncio
import json
import logging
from io import StringIO

import pytest
from httpx import ASGITransport, AsyncClient

from config import settings
from logging_config import JsonFormatter
from main import app


def _configure_stream_logging(level: str) -> StringIO:
    """Attach a JSON-formatted stream handler and return its stream."""

    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(level)

    return stream


def _parse_log_lines(stream: StringIO) -> list[dict[str, object]]:
    """Parse JSON log lines from captured stream output."""

    lines = [line for line in stream.getvalue().splitlines() if line.strip()]
    return [json.loads(line) for line in lines]


@pytest.mark.anyio
async def test_health_request_emits_json_log_line_with_required_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Emit valid JSON logs including timestamp/level/message for health checks."""

    monkeypatch.setattr(settings, "auth_mode", "insecure")
    stream = _configure_stream_logging("INFO")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200

    payloads = _parse_log_lines(stream)
    assert payloads
    assert any(
        {"timestamp", "level", "message"}.issubset(payload.keys())
        for payload in payloads
    )


@pytest.mark.anyio
async def test_bookings_request_log_contains_user_and_request_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Include user_email/path/method fields for authenticated bookings requests."""

    monkeypatch.setattr(settings, "auth_mode", "insecure")
    stream = _configure_stream_logging("INFO")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/v1/bookings",
            headers={"X-Dev-User": "user@example.com"},
        )

    assert response.status_code == 200

    payloads = _parse_log_lines(stream)
    assert any(
        payload.get("user_email") == "user@example.com"
        and payload.get("path") == "/api/v1/bookings"
        and payload.get("method") == "GET"
        and payload.get("status_code") == 200
        for payload in payloads
    )


@pytest.mark.anyio
async def test_info_logs_not_emitted_when_log_level_is_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Suppress INFO-level logs when configured log level is WARNING."""

    monkeypatch.setattr(settings, "auth_mode", "insecure")
    stream = _configure_stream_logging("WARNING")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200

    payloads = _parse_log_lines(stream)
    assert not any(payload.get("level") == "INFO" for payload in payloads)


@pytest.mark.anyio
async def test_debug_logs_are_emitted_when_log_level_is_debug(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Emit DEBUG-level request logs when configured level is DEBUG."""

    monkeypatch.setattr(settings, "auth_mode", "insecure")
    stream = _configure_stream_logging("DEBUG")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200

    payloads = _parse_log_lines(stream)
    assert any(payload.get("level") == "DEBUG" for payload in payloads)


@pytest.mark.anyio
async def test_concurrent_requests_receive_distinct_request_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Assign a unique request_id per concurrent request."""

    monkeypatch.setattr(settings, "auth_mode", "insecure")
    stream = _configure_stream_logging("INFO")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        await asyncio.gather(
            client.get("/api/v1/health"),
            client.get("/api/v1/health"),
        )

    payloads = _parse_log_lines(stream)
    request_ids = {
        str(payload.get("request_id"))
        for payload in payloads
        if payload.get("message") == "request_finished"
    }

    assert len(request_ids) >= 2
