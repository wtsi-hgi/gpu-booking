"""Application configuration using pydantic-settings."""

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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
