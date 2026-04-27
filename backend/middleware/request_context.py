"""Request-scoped context helpers and middleware for structured logging."""

from __future__ import annotations

import logging
from contextvars import ContextVar
from uuid import uuid4

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("gpu_booking.request")

_request_context: ContextVar[dict[str, object]] = ContextVar(
    "request_context", default={}
)


def get_request_context() -> dict[str, object]:
    """Return the current request context payload."""

    return _request_context.get()


def set_request_context_user_email(user_email: str) -> None:
    """Store authenticated user email in request-local context."""

    context = dict(get_request_context())
    context["user_email"] = user_email
    _request_context.set(context)


class RequestContextMiddleware:
    """Populate and clear per-request metadata used by structured logging."""

    def __init__(self, app: ASGIApp) -> None:
        """Store wrapped ASGI application."""

        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Attach request metadata to context and log request lifecycle."""

        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        token = _request_context.set(
            {
                "request_id": str(uuid4()),
                "path": scope.get("path", ""),
                "method": scope.get("method", ""),
            }
        )

        logger.debug("request_started")

        async def send_with_status(message: Message) -> None:
            if message["type"] == "http.response.start":
                context = dict(get_request_context())
                context["status_code"] = message.get("status")
                _request_context.set(context)
            await send(message)

        try:
            await self.app(scope, receive, send_with_status)
            logger.info("request_finished")
        finally:
            _request_context.reset(token)
