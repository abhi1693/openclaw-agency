"""WebSocket chat session model for H5 user relay (M4)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class H5ChatSession(QueryModel, table=True):
    """Persistent chat session linking an H5 user to a gateway-hosted agent."""

    __tablename__ = "h5_chat_sessions"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    h5_user_id: UUID = Field(foreign_key="h5_users.id", index=True)
    agent_id: UUID = Field(foreign_key="agents.id", index=True)
    gateway_id: UUID = Field(foreign_key="gateways.id", index=True)
    session_key: str = Field(max_length=255)
    status: str = Field(default="active", max_length=32, index=True)
    last_message_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
