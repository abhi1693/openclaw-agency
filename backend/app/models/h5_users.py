"""H5 end-user models for mobile web authentication and agent assignments."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field, UniqueConstraint

from app.core.time import utcnow
from app.models.base import QueryModel


class H5User(QueryModel, table=True):
    """H5 mobile web end user with independent username/password auth."""

    __tablename__ = "h5_users"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint("organization_id", "username", name="uq_h5_users_org_username"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    username: str = Field(max_length=64, index=True)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    password_hash: str = Field(max_length=255)
    display_name: str | None = Field(default=None, max_length=128)
    avatar_url: str | None = Field(default=None, max_length=512)
    status: str = Field(default="active", max_length=32, index=True)
    last_login_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class H5RefreshToken(QueryModel, table=True):
    """Hashed refresh token for H5 user JWT rotation."""

    __tablename__ = "h5_refresh_tokens"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    h5_user_id: UUID = Field(foreign_key="h5_users.id", index=True)
    token_hash: str = Field(max_length=255, unique=True)
    expires_at: datetime
    revoked: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


class H5UserAgentAssignment(QueryModel, table=True):
    """Assignment linking an H5 user to an agent on a specific board."""

    __tablename__ = "h5_user_agent_assignments"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint("h5_user_id", "agent_id", name="uq_h5_assign_user_agent"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    h5_user_id: UUID = Field(foreign_key="h5_users.id", index=True)
    agent_id: UUID = Field(foreign_key="agents.id", index=True)
    board_id: UUID = Field(foreign_key="boards.id", index=True)
    role: str = Field(default="user", max_length=32)
    assigned_at: datetime = Field(default_factory=utcnow)
    assigned_by: UUID | None = Field(default=None, foreign_key="users.id")
