"""Application settings and environment configuration loading."""

from __future__ import annotations

from pathlib import Path
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.auth_mode import AuthMode

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = BACKEND_ROOT / ".env"
LOCAL_AUTH_TOKEN_MIN_LENGTH = 50
LOCAL_AUTH_TOKEN_PLACEHOLDERS = frozenset(
    {
        "change-me",
        "changeme",
        "replace-me",
        "replace-with-strong-random-token",
    },
)


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

    # Auth mode: "clerk" for Clerk JWT auth, "local" for shared bearer token auth.
    auth_mode: AuthMode
    local_auth_token: str = ""

    # Clerk auth (auth only; roles stored in DB)
    clerk_secret_key: str = ""
    clerk_api_url: str = "https://api.clerk.com"
    clerk_verify_iat: bool = True
    clerk_leeway: float = 10.0

    cors_origins: str = ""
    base_url: str = ""

    # Database lifecycle
    db_auto_migrate: bool = False

    # RQ queueing / dispatch
    rq_redis_url: str = "redis://localhost:6379/0"
    rq_queue_name: str = "default"
    rq_dispatch_throttle_seconds: float = 15.0
    rq_dispatch_max_retries: int = 3
    rq_dispatch_retry_base_seconds: float = 10.0
    rq_dispatch_retry_max_seconds: float = 120.0

    # H5 user authentication
    h5_jwt_secret: str = ""
    h5_jwt_access_ttl_minutes: int = 15
    h5_jwt_refresh_ttl_days: int = 30

    # Gateway auto-registration (M2)
    gateway_registration_enabled: bool = True
    gateway_heartbeat_interval_seconds: int = 30
    gateway_offline_threshold_seconds: int = 90

    # WebSocket Relay (M4)
    ws_redis_pubsub_url: str = "redis://localhost:6379/1"
    ws_heartbeat_interval_seconds: int = 30
    ws_heartbeat_timeout_seconds: int = 90
    ws_max_connections_per_instance: int = 10000

    # Proactivity Engine (M8)
    proactivity_redis_url: str = "redis://localhost:6379/2"
    proactivity_event_ttl_days: int = 90
    proactivity_suggestion_expiry_hours: int = 168
    proactivity_rule_cooldown_seconds: int = 3600

    # 看板实时同步 (M9)
    board_sync_redis_url: str = "redis://localhost:6379/3"

    # Knowledge Hub (M12)
    embedding_provider: str = "none"  # openai | tongyi | local | none
    embedding_api_key: str = ""
    embedding_model: str = "text-embedding-ada-002"
    embedding_base_url: str = ""
    knowledge_search_language: str = "english"
    knowledge_max_document_size_mb: int = 50

    # OpenClaw gateway runtime compatibility
    gateway_min_version: str = "2026.02.9"

    # Logging
    log_level: str = "INFO"
    log_format: str = "text"
    log_use_utc: bool = False
    request_log_slow_ms: int = Field(default=1000, ge=0)
    request_log_include_health: bool = False

    @model_validator(mode="after")
    def _defaults(self) -> Self:
        if self.auth_mode == AuthMode.CLERK:
            if not self.clerk_secret_key.strip():
                raise ValueError(
                    "CLERK_SECRET_KEY must be set and non-empty when AUTH_MODE=clerk.",
                )
        elif self.auth_mode == AuthMode.LOCAL:
            token = self.local_auth_token.strip()
            if (
                not token
                or len(token) < LOCAL_AUTH_TOKEN_MIN_LENGTH
                or token.lower() in LOCAL_AUTH_TOKEN_PLACEHOLDERS
            ):
                raise ValueError(
                    "LOCAL_AUTH_TOKEN must be at least 50 characters and non-placeholder when AUTH_MODE=local.",
                )
        # Require a real H5 JWT secret in all non-dev environments to prevent
        # accidental deployment with an empty signing key.
        if self.environment != "dev" and not self.h5_jwt_secret.strip():
            raise ValueError(
                "H5_JWT_SECRET must be set and non-empty when ENVIRONMENT is not 'dev'.",
            )
        # In dev, default to applying Alembic migrations at startup to avoid
        # schema drift (e.g. missing newly-added columns).
        if "db_auto_migrate" not in self.model_fields_set and self.environment == "dev":
            self.db_auto_migrate = True
        return self


settings = Settings()
