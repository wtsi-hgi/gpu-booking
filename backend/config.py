"""Application configuration using pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
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
    backend_port: int = 8000
    host: str = "0.0.0.0"
    reload: bool = True  # Auto-reload on code changes (dev only)

    # Auth
    auth_mode: str = "insecure"  # "oidc" or "insecure"
    okta_issuer: str = ""
    okta_client_id: str = ""
    okta_client_secret: str = ""
    okta_audience: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///./gpu_booking.db"

    # Admin
    initial_admin_emails: str = ""  # comma-separated

    # Observability / shared resources
    log_level: str = "INFO"
    http_client_timeout: float = 10.0


# Global settings instance
settings = Settings()
