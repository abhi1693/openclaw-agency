"""JWT authentication and password hashing for Mission Control subsystem.

This module is separate from the main app auth (Clerk/local-token) and handles
MC-specific multi-user JWT authentication with bcrypt password hashing.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

JWT_SECRET = os.environ.get("JWT_SECRET", "mission-control-jwt-secret-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
REFRESH_TOKEN_EXPIRE_DAYS = 7


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_access_token(user_id: str, email: str, role: str) -> str:
    """Create a JWT access token (24h expiry)."""
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """Create a JWT refresh token (7 days expiry)."""
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises jwt.exceptions on failure."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
