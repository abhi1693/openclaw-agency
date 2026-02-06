from __future__ import annotations

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import model_validator
from sqlmodel import SQLModel

ApprovalStatus = Literal["pending", "approved", "rejected"]


class ApprovalBase(SQLModel):
    action_type: str
    task_id: UUID | None = None
    payload: dict[str, object] | None = None
    confidence: int
    rubric_scores: dict[str, int] | None = None
    status: ApprovalStatus = "pending"


class ApprovalCreate(ApprovalBase):
    agent_id: UUID | None = None


class ApprovalUpdate(SQLModel):
    status: ApprovalStatus | None = None

    @model_validator(mode="after")
    def validate_status(self) -> Self:
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("status is required")
        return self


class ApprovalRead(ApprovalBase):
    id: UUID
    board_id: UUID
    agent_id: UUID | None = None
    created_at: datetime
    resolved_at: datetime | None = None
