"""Pydantic schemas for agent suggestion API payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import SQLModel


class AgentSuggestionRead(SQLModel):
    """Read schema for agent suggestion records."""

    id: UUID
    organization_id: UUID
    board_id: UUID | None
    agent_id: UUID | None
    suggestion_type: str
    title: str
    description: str | None
    confidence: float
    priority: str
    status: str
    payload: dict | None
    source_event_id: UUID | None
    resolved_by_user_id: UUID | None
    resolved_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AgentSuggestionCreate(SQLModel):
    """Payload for creating an agent suggestion (agent-facing endpoint)."""

    suggestion_type: str
    title: str
    description: str | None = None
    confidence: float = 0.5
    priority: str = "medium"
    payload: dict | None = None
    board_id: UUID | None = None
    agent_id: UUID | None = None


class AgentSuggestionUpdate(SQLModel):
    """Payload for partial suggestion updates (internal use)."""

    status: str | None = None
    resolved_by_user_id: UUID | None = None
    resolved_at: datetime | None = None
