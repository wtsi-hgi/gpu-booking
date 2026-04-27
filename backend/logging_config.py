"""Structured logging configuration for backend services."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from middleware.request_context import get_request_context


class JsonFormatter(logging.Formatter):
    """Render log records as structured JSON lines."""

    def format(self, record: logging.LogRecord) -> str:
        """Convert a log record into a JSON string."""

        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }

        for field in (
            "request_id",
            "user_email",
            "path",
            "method",
            "status_code",
        ):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value

        context = get_request_context()
        for key, value in context.items():
            if value is not None and key not in payload:
                payload[key] = value

        return json.dumps(payload, default=str)


def setup_logging(level: str) -> None:
    """Configure root logger to emit structured JSON logs at the given level."""

    root_logger = logging.getLogger()
    root_logger.handlers.clear()

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    root_logger.addHandler(handler)
    root_logger.setLevel(level.upper())
