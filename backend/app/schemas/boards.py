from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import model_validator
from sqlmodel import SQLModel


class BoardBase(SQLModel):
    name: str
    slug: str
    gateway_id: UUID | None = None
    board_type: str = "goal"
    objective: str | None = None
    success_metrics: dict[str, object] | None = None
    target_date: datetime | None = None
    goal_confirmed: bool = False
    goal_source: str | None = None


class BoardCreate(BoardBase):
    @model_validator(mode="after")
    def validate_goal_fields(self):
        if self.board_type == "goal" and self.goal_confirmed:
            if not self.objective or not self.success_metrics:
                raise ValueError("Confirmed goal boards require objective and success_metrics")
        return self


class BoardUpdate(SQLModel):
    name: str | None = None
    slug: str | None = None
    gateway_id: UUID | None = None
    board_type: str | None = None
    objective: str | None = None
    success_metrics: dict[str, object] | None = None
    target_date: datetime | None = None
    goal_confirmed: bool | None = None
    goal_source: str | None = None


class BoardRead(BoardBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
