from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import SQLModel


class ApprovalBase(SQLModel):
    action_type: str
    payload: dict[str, object] | None = None
    confidence: int
    rubric_scores: dict[str, int] | None = None
    status: str = "pending"


class ApprovalCreate(ApprovalBase):
    agent_id: UUID | None = None


class ApprovalUpdate(SQLModel):
    status: str | None = None


class ApprovalRead(ApprovalBase):
    id: UUID
    board_id: UUID
    agent_id: UUID | None = None
    created_at: datetime
    resolved_at: datetime | None = None
