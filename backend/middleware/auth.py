"""Authentication and authorization dependencies for API routes."""

from __future__ import annotations

import base64
import json
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from api.schemas import UserInfo
from config import settings
from db.engine import async_session_factory
from db.models import Admin
from middleware.request_context import set_request_context_user_email


def _get_default_insecure_user_email() -> str:
    """Return the default insecure-mode user email."""

    candidates = [
        email.strip()
        for email in settings.initial_admin_emails.split(",")
        if email.strip()
    ]
    if candidates:
        return candidates[0]
    return "dev@example.com"


def _decode_unverified_jwt_payload(token: str) -> dict[str, Any]:
    """Decode JWT payload without signature verification."""

    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
        )

    payload_segment = parts[1]
    padding = "=" * (-len(payload_segment) % 4)

    try:
        payload_bytes = base64.urlsafe_b64decode(payload_segment + padding)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token payload",
        ) from error

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token payload",
        )

    return payload


async def _is_admin_user(email: str) -> bool:
    """Return whether the given email is in the admins table."""

    async with async_session_factory() as session:
        try:
            result = await session.execute(select(Admin.id).where(Admin.email == email))
        except SQLAlchemyError:
            return False

        return result.scalar_one_or_none() is not None


async def get_current_user(request: Request) -> UserInfo:
    """Extract current user from request based on configured auth mode."""

    auth_mode = settings.auth_mode.lower()

    if auth_mode == "insecure":
        header_email = request.headers.get("X-Dev-User")
        if header_email:
            email = header_email.strip()
            is_admin = await _is_admin_user(email)
        else:
            email = _get_default_insecure_user_email()
            is_admin = True

        set_request_context_user_email(email)
        return UserInfo(email=email, is_admin=is_admin, auth_mode="insecure")

    if auth_mode == "oidc":
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing bearer token",
            )

        token = auth_header.replace("Bearer ", "", 1).strip()
        claims = _decode_unverified_jwt_payload(token)

        issuer = str(claims.get("iss", "")).strip()
        if settings.okta_issuer and issuer != settings.okta_issuer:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token issuer",
            )

        email = str(
            claims.get("email") or claims.get("preferred_username") or ""
        ).strip()
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing user email",
            )

        is_admin = await _is_admin_user(email)
        set_request_context_user_email(email)
        return UserInfo(email=email, is_admin=is_admin, auth_mode="oidc")

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unsupported auth mode",
    )


async def require_admin(
    user: Annotated[UserInfo, Depends(get_current_user)],
) -> UserInfo:
    """Require admin privileges for protected endpoints."""

    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user
