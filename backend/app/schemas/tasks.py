from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import field_validator, model_validator
from sqlmodel import Field, SQLModel

from app.schemas.common import NonEmptyStr

TaskStatus = Literal["inbox", "in_progress", "review", "done"]


class TaskBase(SQLModel):
    title: str
    description: str | None = None
    status: TaskStatus = "inbox"
    priority: str = "medium"
    due_at: datetime | None = None
    assigned_agent_id: UUID | None = None
    depends_on_task_ids: list[UUID] = Field(default_factory=list)


class TaskCreate(TaskBase):
    created_by_user_id: UUID | None = None


class TaskUpdate(SQLModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: str | None = None
    due_at: datetime | None = None
    assigned_agent_id: UUID | None = None
    depends_on_task_ids: list[UUID] | None = None
    comment: NonEmptyStr | None = None

    @field_validator("comment", mode="before")
    @classmethod
    def normalize_comment(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def validate_status(self) -> Self:
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("status is required")
        return self


class TaskRead(TaskBase):
    id: UUID
    board_id: UUID | None
    created_by_user_id: UUID | None
    in_progress_at: datetime | None
    created_at: datetime
    updated_at: datetime
    blocked_by_task_ids: list[UUID] = Field(default_factory=list)
    is_blocked: bool = False


class TaskCommentCreate(SQLModel):
    message: NonEmptyStr


class TaskCommentRead(SQLModel):
    id: UUID
    message: str | None
    agent_id: UUID | None
    task_id: UUID | None
    created_at: datetime
