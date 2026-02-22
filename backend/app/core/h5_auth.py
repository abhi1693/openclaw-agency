"""H5 user JWT creation/validation and password hashing utilities."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import bcrypt
import jwt

from app.core.config import settings

H5_TOKEN_TYPE = "h5"
H5_JWT_ALGORITHM = "HS256"


def _get_h5_secret() -> str:
    secret = settings.h5_jwt_secret.strip()
    if not secret:
        if settings.environment != "dev":
            raise RuntimeError("H5_JWT_SECRET must be set in non-dev environments.")
        secret = "h5-dev-secret-not-for-production"
    return secret


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_h5_access_token(h5_user_id: UUID, organization_id: UUID) -> str:
    """Create a short-lived HS256 JWT access token for an H5 user."""
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(h5_user_id),
        "org": str(organization_id),
        "type": H5_TOKEN_TYPE,
        "iat": now,
        "exp": now + timedelta(minutes=settings.h5_jwt_access_ttl_minutes),
    }
    return jwt.encode(payload, _get_h5_secret(), algorithm=H5_JWT_ALGORITHM)


def decode_h5_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an H5 access token. Raises jwt.PyJWTError on failure."""
    return jwt.decode(
        token,
        _get_h5_secret(),
        algorithms=[H5_JWT_ALGORITHM],
        options={"require": ["sub", "org", "type", "exp", "iat"]},
    )


def create_h5_refresh_token() -> str:
    """Generate a cryptographically secure random refresh token."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    """SHA-256 hash a refresh token for safe database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
