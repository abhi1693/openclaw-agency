from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlmodel import Field, SQLModel

from app.schemas.common import NonEmptyStr


class GatewayBoardEnsureRequest(SQLModel):
    name: NonEmptyStr
    slug: str | None = None
    board_type: Literal["goal", "general"] = "goal"
    objective: str | None = None
    success_metrics: dict[str, object] | None = None
    target_date: datetime | None = None
    lead_agent_name: str | None = None
    lead_identity_profile: dict[str, str] | None = None


class GatewayBoardEnsureResponse(SQLModel):
    created: bool = False
    lead_created: bool = False
    board_id: UUID
    lead_agent_id: UUID | None = None

    # Convenience fields for callers that don't want to re-fetch.
    board_name: str
    board_slug: str
    lead_agent_name: str | None = None


class GatewayLeadMessageRequest(SQLModel):
    kind: Literal["question", "handoff"] = "question"
    correlation_id: str | None = None
    content: NonEmptyStr

    # How the lead should reply (defaults are interpreted by templates).
    reply_tags: list[str] = Field(default_factory=lambda: ["gateway_main", "lead_reply"])
    reply_source: str | None = "lead_to_gateway_main"


class GatewayLeadMessageResponse(SQLModel):
    ok: bool = True
    board_id: UUID
    lead_agent_id: UUID | None = None
    lead_agent_name: str | None = None
    lead_created: bool = False


class GatewayLeadBroadcastRequest(SQLModel):
    kind: Literal["question", "handoff"] = "question"
    correlation_id: str | None = None
    content: NonEmptyStr
    board_ids: list[UUID] | None = None
    reply_tags: list[str] = Field(default_factory=lambda: ["gateway_main", "lead_reply"])
    reply_source: str | None = "lead_to_gateway_main"


class GatewayLeadBroadcastBoardResult(SQLModel):
    board_id: UUID
    lead_agent_id: UUID | None = None
    lead_agent_name: str | None = None
    ok: bool = False
    error: str | None = None


class GatewayLeadBroadcastResponse(SQLModel):
    ok: bool = True
    sent: int = 0
    failed: int = 0
    results: list[GatewayLeadBroadcastBoardResult] = Field(default_factory=list)
