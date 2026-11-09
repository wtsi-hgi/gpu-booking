"""Application configuration using pydantic-settings."""

from functools import cached_property
from pathlib import Path

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


class BookingOptions(BaseModel):
    """Suggestions published by the deployment's external reference-data export."""

    model_config = ConfigDict(strict=True, extra="forbid")
    cost_codes: list[str] = Field(default_factory=list)
    project_pis: list[str] = Field(default_factory=list)
    technical_leads: list[str] = Field(default_factory=list)

    @field_validator("cost_codes", "project_pis", "technical_leads")
    @classmethod
    def normalize_suggestions(cls, values: list[str]) -> list[str]:
        """Trim values and remove duplicates while preserving exported order."""
        values = [value.strip() for value in values]
        if any(not value for value in values):
            raise ValueError("Suggestions must be non-empty strings")
        return list(dict.fromkeys(values))


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="GPU_BOOKING_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # API metadata
    app_name: str = "LLM Knowledge Base API"
    app_version: str = "0.1.0"
    app_description: str = "FastAPI backend for Next.js + shadcn/ui frontend"

    # Server configuration
    backend_port: int = Field(
        default=8000,
        validation_alias=AliasChoices("BACKEND_PORT", "GPU_BOOKING_BACKEND_PORT"),
    )
    host: str = Field(
        default="0.0.0.0",
        validation_alias=AliasChoices("HOST", "GPU_BOOKING_HOST"),
    )
    reload: bool = Field(
        default=True,
        validation_alias=AliasChoices("RELOAD", "GPU_BOOKING_RELOAD"),
    )  # Auto-reload on code changes (dev only)

    # Auth
    auth_mode: str = Field(
        default="insecure",
        validation_alias=AliasChoices("AUTH_MODE", "GPU_BOOKING_AUTH_MODE"),
    )  # "oidc" or "insecure"
    okta_issuer: str = Field(
        default="",
        validation_alias=AliasChoices(
            "OKTA_ISSUER",
            "OIDC_ISSUER_URL",
            "OIDC_ISSUER",
            "GPU_BOOKING_OIDC_ISSUER_URL",
            "GPU_BOOKING_OIDC_ISSUER",
            "GPU_BOOKING_OKTA_ISSUER",
        ),
    )
    okta_client_id: str = Field(
        default="",
        validation_alias=AliasChoices(
            "OKTA_CLIENT_ID",
            "OIDC_CLIENT_ID",
            "GPU_BOOKING_OIDC_CLIENT_ID",
            "GPU_BOOKING_OKTA_CLIENT_ID",
        ),
    )
    okta_client_secret: str = Field(
        default="",
        validation_alias=AliasChoices(
            "OKTA_CLIENT_SECRET",
            "OIDC_CLIENT_SECRET",
            "GPU_BOOKING_OIDC_CLIENT_SECRET",
            "GPU_BOOKING_OKTA_CLIENT_SECRET",
        ),
    )
    okta_audience: str = Field(
        default="",
        validation_alias=AliasChoices(
            "OKTA_AUDIENCE",
            "OIDC_AUDIENCE",
            "GPU_BOOKING_OIDC_AUDIENCE",
            "GPU_BOOKING_OKTA_AUDIENCE",
        ),
    )

    # Database
    database_url: str = Field(
        default="sqlite+aiosqlite:///./gpu_booking.db",
        validation_alias=AliasChoices("DATABASE_URL", "GPU_BOOKING_DATABASE_URL"),
    )

    booking_options_file: Path | None = None

    @cached_property
    def booking_options(self) -> BookingOptions:
        """Load suggestions once per backend process; restart to refresh them."""
        if self.booking_options_file is None:
            return BookingOptions(cost_codes=[])
        try:
            contents = self.booking_options_file.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            raise ValueError(
                "Cannot read GPU_BOOKING_BOOKING_OPTIONS_FILE "
                f"'{self.booking_options_file}'. "
                "Check the path, permissions and UTF-8 encoding."
            ) from None
        try:
            return BookingOptions.model_validate_json(contents)
        except ValidationError:
            raise ValueError(
                "Invalid GPU_BOOKING_BOOKING_OPTIONS_FILE "
                f"'{self.booking_options_file}'. Expected a JSON object with optional "
                "cost_codes, project_pis and technical_leads lists of "
                "non-empty strings. "
                "Unknown fields are not allowed."
            ) from None

    # Admin
    initial_admin_emails: str = Field(
        default="",
        validation_alias=AliasChoices(
            "INITIAL_ADMIN_EMAILS",
            "GPU_BOOKING_INITIAL_ADMIN_EMAILS",
        ),
    )  # comma-separated

    # Observability / shared resources
    log_level: str = Field(
        default="INFO",
        validation_alias=AliasChoices("LOG_LEVEL", "GPU_BOOKING_LOG_LEVEL"),
    )
    http_client_timeout: float = Field(
        default=10.0,
        validation_alias=AliasChoices(
            "HTTP_CLIENT_TIMEOUT",
            "GPU_BOOKING_HTTP_CLIENT_TIMEOUT",
        ),
    )


# Global settings instance
settings = Settings()
