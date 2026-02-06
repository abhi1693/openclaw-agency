from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlmodel import SQLModel


class AgentBase(SQLModel):
    board_id: UUID | None = None
    name: str
    status: str = "provisioning"
    heartbeat_config: dict[str, Any] | None = None
    identity_profile: dict[str, Any] | None = None
    identity_template: str | None = None
    soul_template: str | None = None


class AgentCreate(AgentBase):
    pass


class AgentUpdate(SQLModel):
    board_id: UUID | None = None
    is_gateway_main: bool | None = None
    name: str | None = None
    status: str | None = None
    heartbeat_config: dict[str, Any] | None = None
    identity_profile: dict[str, Any] | None = None
    identity_template: str | None = None
    soul_template: str | None = None


class AgentRead(AgentBase):
    id: UUID
    is_board_lead: bool = False
    is_gateway_main: bool = False
    openclaw_session_id: str | None = None
    last_seen_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AgentHeartbeat(SQLModel):
    status: str | None = None


class AgentHeartbeatCreate(AgentHeartbeat):
    name: str
    board_id: UUID | None = None


class AgentNudge(SQLModel):
    message: str
