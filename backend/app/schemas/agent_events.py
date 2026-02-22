"""Pydantic schemas for agent event API payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import SQLModel


class AgentEventRead(SQLModel):
    """Read schema for agent event records."""

    id: UUID
    organization_id: UUID
    board_id: UUID | None
    agent_id: UUID | None
    task_id: UUID | None
    event_type: str
    payload: dict
    created_at: datetime


class AgentEventCreate(SQLModel):
    """Payload for creating an agent event (agent-facing endpoint)."""

    event_type: str
    board_id: UUID | None = None
    agent_id: UUID | None = None
    task_id: UUID | None = None
    payload: dict = {}
