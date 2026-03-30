"""Health and readiness probe response schemas."""

from __future__ import annotations

from uuid import UUID

from pydantic import Field
from sqlmodel import SQLModel


class Pm2Info(SQLModel):
    """pm2 process metadata for the mc-backend process."""

    restarts: int | None = Field(
        default=None,
        description="Number of times pm2 has restarted the process.",
        examples=[3],
    )
    uptime_sec: int | None = Field(
        default=None,
        description="Process uptime in seconds derived from pm2 pm_uptime epoch.",
        examples=[3600],
    )


class HealthStatusResponse(SQLModel):
    """Standard payload for service liveness/readiness checks."""

    ok: bool = Field(
        description="Indicates whether the probe check succeeded.",
        examples=[True],
    )
    process_memory_mb: float | None = Field(
        default=None,
        description="Current process RSS memory usage in megabytes.",
        examples=[128.4],
    )
    pm2: Pm2Info | None = Field(
        default=None,
        description="pm2 process metadata (restarts, uptime). Null if pm2 unavailable.",
    )


class AgentHealthStatusResponse(HealthStatusResponse):
    """Agent-authenticated liveness payload for agent route probes."""

    agent_id: UUID = Field(
        description="Authenticated agent id derived from `X-Agent-Token`.",
        examples=["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    )
    board_id: UUID | None = Field(
        default=None,
        description="Board scope for the authenticated agent, when applicable.",
        examples=["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
    )
    gateway_id: UUID = Field(
        description="Gateway owning the authenticated agent.",
        examples=["cccccccc-cccc-cccc-cccc-cccccccccccc"],
    )
    status: str = Field(
        description="Current persisted lifecycle status for the authenticated agent.",
        examples=["online", "healthy", "updating"],
    )
    is_board_lead: bool = Field(
        description="Whether the authenticated agent is the board lead.",
        examples=[False],
    )
