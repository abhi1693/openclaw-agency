from __future__ import annotations

from sqlmodel import Field, SQLModel


class BlockedTaskDetail(SQLModel):
    message: str
    blocked_by_task_ids: list[str] = Field(default_factory=list)


class BlockedTaskError(SQLModel):
    detail: BlockedTaskDetail
