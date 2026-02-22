"""Pydantic schemas for proactive rule API payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import SQLModel


class ProactiveRuleRead(SQLModel):
    """Read schema for proactive rule records."""

    id: UUID
    organization_id: UUID
    board_id: UUID | None
    name: str
    description: str | None
    trigger_event: str
    conditions: dict
    action_type: str
    action_config: dict
    is_enabled: bool
    is_builtin: bool
    cooldown_seconds: int
    last_fired_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProactiveRuleCreate(SQLModel):
    """Payload for creating a proactive rule."""

    name: str
    description: str | None = None
    trigger_event: str
    conditions: dict = {}
    action_type: str
    action_config: dict = {}
    board_id: UUID | None = None
    cooldown_seconds: int = 3600


class ProactiveRuleUpdate(SQLModel):
    """Payload for partial proactive rule updates."""

    name: str | None = None
    description: str | None = None
    conditions: dict | None = None
    action_config: dict | None = None
    cooldown_seconds: int | None = None
