"""Pydantic schemas for Command Center dashboard aggregation payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import SQLModel


class CommandCenterOverview(SQLModel):
    """High-level KPI snapshot for the Command Center."""

    active_agents: int
    tasks_today: int
    throughput_7d: int
    gateways_online: int
    generated_at: datetime


class AgentStatusItem(SQLModel):
    """Live status for a single agent."""

    id: UUID
    name: str
    status: str
    current_task_id: UUID | None = None
    current_task_title: str | None = None
    gateway_id: UUID
    gateway_name: str | None = None
    last_seen_at: datetime | None = None


class AgentStatusResponse(SQLModel):
    """Response containing all agent statuses."""

    agents: list[AgentStatusItem]


class CommunicationGraphNode(SQLModel):
    """Graph node representing an agent."""

    id: str
    name: str
    status: str
    gateway_id: str | None = None


class CommunicationGraphEdge(SQLModel):
    """Graph edge representing agent-to-agent interaction."""

    from_agent_id: str
    to_agent_id: str
    weight: float
    interaction_count: int


class CommunicationGraphResponse(SQLModel):
    """Response containing communication graph data."""

    nodes: list[CommunicationGraphNode]
    edges: list[CommunicationGraphEdge]


class ResourceAllocationItem(SQLModel):
    """Resource allocation breakdown for a single agent."""

    agent_id: UUID
    agent_name: str
    tasks_assigned: int
    tasks_in_progress: int
    tasks_done_today: int
    estimated_hours: float


class ResourceAllocationResponse(SQLModel):
    """Response containing per-agent resource allocation data."""

    per_agent: list[ResourceAllocationItem]


class LiveActivityEvent(SQLModel):
    """Single event in the live activity stream."""

    id: UUID
    event_type: str
    agent_id: UUID | None = None
    agent_name: str | None = None
    task_id: UUID | None = None
    board_id: UUID | None = None
    payload: dict | None = None
    created_at: datetime


class LiveActivityResponse(SQLModel):
    """Response for the live activity stream endpoint."""

    events: list[LiveActivityEvent]
    next_since_id: UUID | None = None
