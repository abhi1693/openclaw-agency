"""Application settings and environment configuration loading."""

from __future__ import annotations

from pathlib import Path
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    """Typed runtime configuration sourced from environment variables."""

    model_config = SettingsConfigDict(
        # Load `backend/.env` regardless of current working directory.
        # (Important when running uvicorn from repo root or via a process manager.)
        env_file=[DEFAULT_ENV_FILE, ".env"],
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "dev"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/openclaw_agency"

    # Clerk auth (auth only; roles stored in DB)
    clerk_secret_key: str = Field(min_length=1)
    clerk_api_url: str = "https://api.clerk.com"
    clerk_verify_iat: bool = True
    clerk_leeway: float = 10.0

    cors_origins: str = ""
    base_url: str = ""

    # Database lifecycle
    db_auto_migrate: bool = False

    # Logging
    log_level: str = "INFO"
    log_format: str = "text"
    log_use_utc: bool = False
    request_log_slow_ms: int = Field(default=1000, ge=0)
    request_log_include_health: bool = False

    @model_validator(mode="after")
    def _defaults(self) -> Self:
        if not self.clerk_secret_key.strip():
            raise ValueError("CLERK_SECRET_KEY must be set and non-empty.")
        # In dev, default to applying Alembic migrations at startup to avoid
        # schema drift (e.g. missing newly-added columns).
        if "db_auto_migrate" not in self.model_fields_set and self.environment == "dev":
            self.db_auto_migrate = True
        return self


settings = Settings()
