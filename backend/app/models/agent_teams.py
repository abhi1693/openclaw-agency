"""Agent team models for team formation and member management."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class AgentTeam(QueryModel, table=True):
    """Agent team grouping agents with shared purpose."""

    __tablename__ = "agent_teams"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    board_id: UUID | None = Field(default=None, foreign_key="boards.id", index=True)
    name: str = Field(index=True)
    description: str | None = Field(default=None, sa_column=Column(Text))
    team_type: str = Field(default="custom", index=True)
    config: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AgentTeamMember(QueryModel, table=True):
    """Agent membership record within a team with role assignment."""

    __tablename__ = "agent_team_members"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    team_id: UUID = Field(foreign_key="agent_teams.id", index=True)
    agent_id: UUID = Field(foreign_key="agents.id", index=True)
    role_in_team: str = Field(default="member")
    capabilities: list[Any] | None = Field(default=None, sa_column=Column(JSON))
    joined_at: datetime = Field(default_factory=utcnow)
