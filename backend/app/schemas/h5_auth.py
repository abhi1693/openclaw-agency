"""Pydantic schemas for H5 user authentication and management."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import field_validator
from sqlmodel import SQLModel


class H5RegisterRequest(SQLModel):
    """Payload for registering a new H5 user."""

    organization_id: UUID
    username: str
    password: str
    display_name: str | None = None
    email: str | None = None
    phone: str | None = None

    @field_validator("username")
    @classmethod
    def _validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) < 2 or len(v) > 64:
            raise ValueError("Username must be between 2 and 64 characters.")
        return v

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters.")
        return v


class H5LoginRequest(SQLModel):
    """Payload for H5 user login."""

    organization_id: UUID
    username: str
    password: str


class H5RefreshRequest(SQLModel):
    """Payload for refreshing an H5 access token."""

    refresh_token: str


class H5UserRead(SQLModel):
    """Public-facing H5 user representation."""

    id: UUID
    organization_id: UUID
    username: str
    display_name: str | None = None
    email: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    status: str
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class H5UserUpdate(SQLModel):
    """Updatable fields for an H5 user profile.

    Email and phone are intentionally excluded; those fields require a
    dedicated verification flow and must not be changed via PATCH /me.
    """

    display_name: str | None = None
    avatar_url: str | None = None


class H5AssignAgentRequest(SQLModel):
    """Payload for assigning an H5 user to an agent."""

    agent_id: UUID
    board_id: UUID
    role: str = "user"


class H5AssignmentRead(SQLModel):
    """Public-facing H5 user-agent assignment."""

    id: UUID
    h5_user_id: UUID
    agent_id: UUID
    board_id: UUID
    role: str
    assigned_at: datetime
    assigned_by: UUID | None = None


class H5UserMeResponse(SQLModel):
    """Composite response for GET /me including profile and agent assignments."""

    user: H5UserRead
    assignments: list[H5AssignmentRead]


class H5TokenResponse(SQLModel):
    """Response containing user profile and auth tokens."""

    user: H5UserRead
    access_token: str
    refresh_token: str


class H5AccessTokenResponse(SQLModel):
    """Response for token refresh containing new token pair."""

    access_token: str
    refresh_token: str
