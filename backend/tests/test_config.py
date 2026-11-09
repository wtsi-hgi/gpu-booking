"""Tests for application settings configuration."""

from __future__ import annotations

from pathlib import Path

import pytest

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
    """Prefer explicit legacy names over conflicting repo-prefixed values."""

    monkeypatch.setenv("GPU_BOOKING_AUTH_MODE", "insecure")
    monkeypatch.setenv("AUTH_MODE", "oidc")
    monkeypatch.setenv("GPU_BOOKING_DATABASE_URL", "sqlite+aiosqlite:///./prefixed.db")
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///./legacy.db")
    monkeypatch.setenv("GPU_BOOKING_INITIAL_ADMIN_EMAILS", "prefixed@example.com")
    monkeypatch.setenv("INITIAL_ADMIN_EMAILS", "legacy@example.com")
    monkeypatch.setenv("GPU_BOOKING_BACKEND_PORT", "8000")
    monkeypatch.setenv("BACKEND_PORT", "9100")

    settings = Settings(_env_file=None)

    assert settings.auth_mode == "oidc"
    assert settings.database_url == "sqlite+aiosqlite:///./legacy.db"
    assert settings.initial_admin_emails == "legacy@example.com"
    assert settings.backend_port == 9100


def test_booking_options_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep deployments without an export file usable."""
    monkeypatch.delenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", raising=False)
    assert Settings(_env_file=None).booking_options.model_dump() == {
        "cost_codes": [],
        "project_pis": [],
        "technical_leads": [],
        "inference_interactive_gpu_types": [],
    }


def test_booking_options_omitted_list(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Treat an omitted list as no suggestions."""
    export = tmp_path / "booking-options.json"
    export.write_text("{}")
    monkeypatch.setenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", str(export))
    assert Settings(_env_file=None).booking_options.model_dump() == {
        "cost_codes": [],
        "project_pis": [],
        "technical_leads": [],
        "inference_interactive_gpu_types": [],
    }


def test_booking_options_file_snapshot(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Read the environment path once and normalize suggestions in export order."""
    export = tmp_path / "booking-options.json"
    export.write_text(
        '{"cost_codes":[" CC-002 ","CC-001","CC-002"],'
        '"project_pis":[" Dr Example PI Équipe ","Dr Example PI One",'
        '"Dr Example PI Équipe"],'
        '"technical_leads":[" Example Lead Équipe ","Example Lead One",'
        '"Example Lead Équipe"],"inference_interactive_gpu_types":[" H200 ","H200"]}',
        encoding="utf-8",
    )
    monkeypatch.setenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", str(export))
    settings = Settings(_env_file=None)
    assert settings.booking_options.cost_codes == ["CC-002", "CC-001"]
    assert settings.booking_options.project_pis == [
        "Dr Example PI Équipe",
        "Dr Example PI One",
    ]
    assert settings.booking_options.technical_leads == [
        "Example Lead Équipe",
        "Example Lead One",
    ]
    assert settings.booking_options.inference_interactive_gpu_types == ["H200"]
    export.write_text('{"cost_codes":["CC-003"]}')
    assert settings.booking_options.cost_codes == ["CC-002", "CC-001"]
    assert settings.booking_options.project_pis == [
        "Dr Example PI Équipe",
        "Dr Example PI One",
    ]
    assert settings.booking_options.technical_leads == [
        "Example Lead Équipe",
        "Example Lead One",
    ]
    assert settings.booking_options.inference_interactive_gpu_types == ["H200"]
    assert (
        Settings(_env_file=None).booking_options.inference_interactive_gpu_types == []
    )
    assert Settings(_env_file=None).booking_options.cost_codes == ["CC-003"]
    assert Settings(_env_file=None).booking_options.project_pis == []
    assert Settings(_env_file=None).booking_options.technical_leads == []


@pytest.mark.parametrize(
    "contents",
    [
        "secret-not-json",
        "[]",
        '{"cost_codes":"secret-value"}',
        '{"cost_codes":[123]}',
        '{"cost_codes":[null]}',
        '{"cost_codes":["  "]}',
        '{"project_pis":"secret-value"}',
        '{"project_pis":[123]}',
        '{"project_pis":[null]}',
        '{"project_pis":["  "]}',
        '{"technical_leads":"secret-value"}',
        '{"technical_leads":[123]}',
        '{"technical_leads":[null]}',
        '{"technical_leads":["  "]}',
        '{"inference_interactive_gpu_types":"secret-value"}',
        '{"inference_interactive_gpu_types":[123]}',
        '{"inference_interactive_gpu_types":[null]}',
        '{"inference_interactive_gpu_types":["  "]}',
        '{"cost_codes":[],"unknown":"secret-value"}',
    ],
)
def test_invalid_booking_options_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, contents: str
) -> None:
    """Reject bad exports with a useful error that omits file contents."""
    export = tmp_path / "booking-options.json"
    export.write_text(contents)
    monkeypatch.setenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", str(export))
    with pytest.raises(
        ValueError, match="Invalid GPU_BOOKING_BOOKING_OPTIONS_FILE"
    ) as error:
        _ = Settings(_env_file=None).booking_options
    assert "non-empty strings" in str(error.value)
    assert "secret" not in str(error.value)


@pytest.mark.parametrize("file_kind", ["missing", "directory", "invalid-utf8"])
def test_unreadable_booking_options_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, file_kind: str
) -> None:
    """Explain invalid configured paths and encodings without ignoring them."""
    export = tmp_path / "booking-options.json"
    if file_kind == "directory":
        export.mkdir()
    elif file_kind == "invalid-utf8":
        export.write_bytes(b"\xff")
    monkeypatch.setenv("GPU_BOOKING_BOOKING_OPTIONS_FILE", str(export))
    with pytest.raises(
        ValueError, match="Cannot read GPU_BOOKING_BOOKING_OPTIONS_FILE"
    ):
        _ = Settings(_env_file=None).booking_options
