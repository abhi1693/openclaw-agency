from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Approval(SQLModel, table=True):
    __tablename__ = "approvals"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    board_id: UUID = Field(foreign_key="boards.id", index=True)
    agent_id: UUID | None = Field(default=None, foreign_key="agents.id", index=True)
    action_type: str
    payload: dict[str, object] | None = Field(default=None, sa_column=Column(JSON))
    confidence: int
    rubric_scores: dict[str, int] | None = Field(default=None, sa_column=Column(JSON))
    status: str = Field(default="pending", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: datetime | None = None
