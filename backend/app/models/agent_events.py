"""AgentEvent ORM model for the proactivity event audit log."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON
from sqlmodel import Field

from app.core.time import utcnow
from app.models.tenancy import TenantScoped


class AgentEvent(TenantScoped, table=True):
    """Append-only audit log of system events consumed by the rule engine."""

    __tablename__ = "agent_events"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    board_id: UUID | None = Field(default=None, foreign_key="boards.id", index=True)
    agent_id: UUID | None = Field(default=None, foreign_key="agents.id", index=True)
    task_id: UUID | None = Field(default=None, foreign_key="tasks.id", index=True)
    event_type: str = Field(index=True)
    payload: dict = Field(default_factory=dict, sa_type=JSON)
    created_at: datetime = Field(default_factory=utcnow)
