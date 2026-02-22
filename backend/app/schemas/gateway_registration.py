"""Schemas for gateway auto-registration, heartbeat, and deregistration."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlmodel import SQLModel


class GatewayRegisterRequest(SQLModel):
    """Payload for gateway self-registration on startup."""

    organization_id: UUID
    registration_token: str
    name: str
    url: str
    workspace_root: str
    version: str | None = None
    capabilities: list[str] | None = None


class GatewayRegisterResponse(SQLModel):
    """Response after successful gateway registration."""

    gateway_id: UUID
    relay_ws_url: str
    relay_token: str
    heartbeat_interval_seconds: int


class GatewayHeartbeatRequest(SQLModel):
    """Periodic heartbeat from a registered gateway."""

    gateway_id: UUID
    relay_token: str
    status: str = "online"
    metrics: dict[str, Any] | None = None


class GatewayHeartbeatResponse(SQLModel):
    """Response to a gateway heartbeat."""

    ok: bool = True
    config_update: dict[str, Any] | None = None


class GatewayDeregisterRequest(SQLModel):
    """Payload for gateway graceful shutdown deregistration."""

    gateway_id: UUID
    relay_token: str


class GatewayConnectionRead(SQLModel):
    """Read model for a gateway with registration status info."""

    id: UUID
    organization_id: UUID
    name: str
    url: str
    workspace_root: str
    status: str
    auto_registered: bool
    last_heartbeat_at: datetime | None = None
    connection_info: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
