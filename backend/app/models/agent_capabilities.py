"""Agent capability profile model for intelligent assignment and search."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class AgentCapability(QueryModel, table=True):
    """Capability profile entry for an agent with proficiency level."""

    __tablename__ = "agent_capabilities"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    agent_id: UUID = Field(foreign_key="agents.id", index=True)
    capability: str = Field(index=True)
    proficiency: str = Field(default="standard")
    extra_data: dict[str, Any] | None = Field(
        default=None, sa_column=Column("metadata", JSON, nullable=True)
    )
    created_at: datetime = Field(default_factory=utcnow)
