"""Authentication and authorization dependencies for API routes."""

from __future__ import annotations

from typing import Annotated, Any

import anyio
from fastapi import Depends, HTTPException, Request, status
from jwt import InvalidTokenError, PyJWKClient
from jwt import decode as jwt_decode
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


_JWK_CLIENTS: dict[str, PyJWKClient] = {}


def _get_jwk_client(issuer: str) -> PyJWKClient:
    """Return a cached JWKS client for the configured issuer."""

    jwks_uri = f"{issuer.rstrip('/')}/v1/keys"
    client = _JWK_CLIENTS.get(jwks_uri)
    if client is None:
        client = PyJWKClient(jwks_uri)
        _JWK_CLIENTS[jwks_uri] = client
    return client


async def _decode_and_verify_oidc_token(token: str) -> dict[str, Any]:
    """Decode and verify an OIDC bearer token using the issuer's JWKS."""

    issuer = settings.okta_issuer.strip()
    if not issuer:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OIDC issuer is not configured",
        )

    try:
        jwk_client = _get_jwk_client(issuer)
        signing_key = await anyio.to_thread.run_sync(
            jwk_client.get_signing_key_from_jwt,
            token,
        )

        audience = settings.okta_audience.strip() or None
        options = {"verify_aud": audience is not None}
        claims: dict[str, Any] = jwt_decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=issuer,
            options=options,
        )
    except InvalidTokenError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to verify bearer token",
        ) from error

    if not isinstance(claims, dict):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token payload",
        )

    return claims


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
        claims = await _decode_and_verify_oidc_token(token)

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
