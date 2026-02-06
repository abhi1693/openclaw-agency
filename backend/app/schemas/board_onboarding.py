from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import model_validator
from sqlmodel import SQLModel


class BoardOnboardingStart(SQLModel):
    pass


class BoardOnboardingAnswer(SQLModel):
    answer: str
    other_text: str | None = None


class BoardOnboardingConfirm(SQLModel):
    board_type: str
    objective: str | None = None
    success_metrics: dict[str, object] | None = None
    target_date: datetime | None = None

    @model_validator(mode="after")
    def validate_goal_fields(self):
        if self.board_type == "goal":
            if not self.objective or not self.success_metrics:
                raise ValueError("Confirmed goal boards require objective and success_metrics")
        return self


class BoardOnboardingRead(SQLModel):
    id: UUID
    board_id: UUID
    session_key: str
    status: str
    messages: list[dict[str, object]] | None = None
    draft_goal: dict[str, object] | None = None
    created_at: datetime
    updated_at: datetime
