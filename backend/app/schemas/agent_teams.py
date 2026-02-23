"""Pydantic schemas for agent team and capability API payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field
from sqlmodel import SQLModel


class AgentTeamBase(SQLModel):
    """Common fields for agent team create/update payloads."""

    name: str = Field(description="Team display name.")
    description: str | None = Field(default=None, description="Optional team description.")
    team_type: str = Field(
        default="custom",
        description="Team type: custom, task_force, review_committee, specialist_pool.",
    )
    board_id: UUID | None = Field(default=None, description="Optional board scope.")
    config: dict[str, Any] | None = Field(default=None, description="Optional team config.")


class AgentTeamCreate(AgentTeamBase):
    """Payload for creating a new agent team."""


class AgentTeamUpdate(SQLModel):
    """Payload for patching an existing agent team."""

    name: str | None = Field(default=None)
    description: str | None = Field(default=None)
    team_type: str | None = Field(default=None)
    board_id: UUID | None = Field(default=None)
    config: dict[str, Any] | None = Field(default=None)


class AgentTeamRead(AgentTeamBase):
    """Public agent team representation returned by the API."""

    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime
    member_count: int = Field(default=0, description="Number of members in the team.")


class AgentTeamMemberBase(SQLModel):
    """Common fields for team member payloads."""

    agent_id: UUID = Field(description="Agent UUID to add to the team.")
    role_in_team: str = Field(
        default="member",
        description="Role: leader, specialist, member, reviewer.",
    )
    capabilities: list[str] | None = Field(
        default=None, description="Optional capability tags for this member."
    )


class AgentTeamMemberCreate(AgentTeamMemberBase):
    """Payload for adding a member to a team."""


class AgentTeamMemberRead(AgentTeamMemberBase):
    """Public team member representation."""

    id: UUID
    team_id: UUID
    agent_name: str | None = Field(default=None, description="Agent display name.")
    joined_at: datetime


# --- Agent Capability Schemas ---


class AgentCapabilityBase(SQLModel):
    """Common fields for agent capability payloads."""

    capability: str = Field(description="Capability tag: code_review, python, testing, etc.")
    proficiency: str = Field(
        default="standard",
        description="Proficiency level: novice, standard, expert.",
    )


class AgentCapabilityCreate(AgentCapabilityBase):
    """Payload for adding a capability to an agent."""


class AgentCapabilityRead(AgentCapabilityBase):
    """Public agent capability representation."""

    id: UUID
    agent_id: UUID
    organization_id: UUID
    metadata: dict[str, Any] | None = None
    created_at: datetime


class CapabilitySearchResult(SQLModel):
    """Agent matched by capability search."""

    agent_id: UUID
    agent_name: str
    matched_capabilities: list[str]
    proficiency_scores: dict[str, str]


class CapabilitySearchResponse(SQLModel):
    """Response for capability search endpoint."""

    agents: list[CapabilitySearchResult]
