"""Tests for application settings configuration."""

from __future__ import annotations

from config import Settings


def test_settings_defaults_when_env_vars_are_unset(monkeypatch) -> None:
    """Use documented defaults when auth/database/admin env vars are absent."""

    monkeypatch.delenv("GPU_BOOKING_AUTH_MODE", raising=False)
    monkeypatch.delenv("AUTH_MODE", raising=False)
    monkeypatch.delenv("GPU_BOOKING_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("GPU_BOOKING_INITIAL_ADMIN_EMAILS", raising=False)
    monkeypatch.delenv("INITIAL_ADMIN_EMAILS", raising=False)

    settings = Settings(_env_file=None)

    assert settings.auth_mode == "insecure"
    assert settings.database_url == "sqlite+aiosqlite:///./gpu_booking.db"
    assert settings.initial_admin_emails == ""


def test_settings_read_okta_values_from_environment(monkeypatch) -> None:
    """Load OIDC settings from the corresponding environment variables."""

    monkeypatch.setenv("GPU_BOOKING_AUTH_MODE", "oidc")
    monkeypatch.setenv("GPU_BOOKING_OKTA_ISSUER", "https://example.okta.com")
    monkeypatch.setenv("GPU_BOOKING_OKTA_CLIENT_ID", "abc")
    monkeypatch.setenv("GPU_BOOKING_OKTA_CLIENT_SECRET", "secret")

    settings = Settings(_env_file=None)

    assert settings.auth_mode == "oidc"
    assert settings.okta_issuer == "https://example.okta.com"
    assert settings.okta_client_id == "abc"
    assert settings.okta_client_secret == "secret"


def test_settings_read_oidc_alias_values_from_environment(monkeypatch) -> None:
    """Load OIDC settings from alias environment variable names."""

    monkeypatch.setenv("GPU_BOOKING_AUTH_MODE", "oidc")
    monkeypatch.setenv("GPU_BOOKING_OIDC_ISSUER_URL", "https://issuer.example.com")
    monkeypatch.setenv("GPU_BOOKING_OIDC_CLIENT_ID", "frontend-client")
    monkeypatch.setenv("GPU_BOOKING_OIDC_CLIENT_SECRET", "top-secret")
    monkeypatch.setenv("GPU_BOOKING_OIDC_AUDIENCE", "api://gpu-booking")

    settings = Settings(_env_file=None)

    assert settings.auth_mode == "oidc"
    assert settings.okta_issuer == "https://issuer.example.com"
    assert settings.okta_client_id == "frontend-client"
    assert settings.okta_client_secret == "top-secret"
    assert settings.okta_audience == "api://gpu-booking"


def test_settings_preserve_initial_admin_emails_string(monkeypatch) -> None:
    """Keep initial admin emails untouched for parsing in seed utilities."""

    monkeypatch.setenv("GPU_BOOKING_INITIAL_ADMIN_EMAILS", "a@b.com, c@d.com")

    settings = Settings(_env_file=None)

    assert settings.initial_admin_emails == "a@b.com, c@d.com"


def test_settings_support_legacy_environment_variable_names(monkeypatch) -> None:
    """Accept historical unprefixed names while preferring repo-specific ones."""

    monkeypatch.setenv("AUTH_MODE", "oidc")
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///./legacy.db")
    monkeypatch.setenv("INITIAL_ADMIN_EMAILS", "legacy@example.com")
    monkeypatch.setenv("BACKEND_PORT", "9100")

    settings = Settings(_env_file=None)

    assert settings.auth_mode == "oidc"
    assert settings.database_url == "sqlite+aiosqlite:///./legacy.db"
    assert settings.initial_admin_emails == "legacy@example.com"
    assert settings.backend_port == 9100
