from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field

from app.models.tenancy import TenantScoped


class Task(TenantScoped, table=True):
    __tablename__ = "tasks"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    board_id: UUID | None = Field(default=None, foreign_key="boards.id", index=True)

    title: str
    description: str | None = None
    status: str = Field(default="inbox", index=True)
    priority: str = Field(default="medium", index=True)
    due_at: datetime | None = None
    in_progress_at: datetime | None = None

    created_by_user_id: UUID | None = Field(default=None, foreign_key="users.id", index=True)
    assigned_agent_id: UUID | None = Field(default=None, foreign_key="agents.id", index=True)
    auto_created: bool = Field(default=False)
    auto_reason: str | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
