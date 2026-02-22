"""ProactiveRule ORM model for builtin and user-defined event-driven rules."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON
from sqlmodel import Field

from app.core.time import utcnow
from app.models.tenancy import TenantScoped


class ProactiveRule(TenantScoped, table=True):
    """Configuration for a rule that evaluates events and creates suggestions."""

    __tablename__ = "proactive_rules"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    board_id: UUID | None = Field(default=None, foreign_key="boards.id", index=True)

    name: str = Field(max_length=256)
    description: str | None = None
    trigger_event: str = Field(max_length=128, index=True)
    conditions: dict = Field(default_factory=dict, sa_type=JSON)
    action_type: str = Field(max_length=64)
    action_config: dict = Field(default_factory=dict, sa_type=JSON)

    is_enabled: bool = Field(default=True)
    is_builtin: bool = Field(default=False)
    cooldown_seconds: int = Field(default=3600)
    last_fired_at: datetime | None = None

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
