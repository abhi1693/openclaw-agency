"""AgentSuggestion ORM model for AI-generated proactive suggestions."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON
from sqlmodel import Field

from app.core.time import utcnow
from app.models.tenancy import TenantScoped


class AgentSuggestion(TenantScoped, table=True):
    """AI-generated suggestion with a lifecycle from pending to resolved."""

    __tablename__ = "agent_suggestions"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    board_id: UUID | None = Field(default=None, foreign_key="boards.id", index=True)
    agent_id: UUID | None = Field(default=None, foreign_key="agents.id", index=True)

    suggestion_type: str = Field(max_length=64)
    title: str = Field(max_length=512)
    description: str | None = None
    confidence: float = Field(default=0.5)
    priority: str = Field(default="medium")
    status: str = Field(default="pending", index=True)
    payload: dict | None = Field(default=None, sa_type=JSON)

    source_event_id: UUID | None = Field(
        default=None,
        foreign_key="agent_events.id",
        index=True,
    )
    resolved_by_user_id: UUID | None = Field(
        default=None,
        foreign_key="users.id",
        index=True,
    )
    resolved_at: datetime | None = None
    expires_at: datetime | None = None

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
