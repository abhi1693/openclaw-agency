from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class BoardOnboardingSession(SQLModel, table=True):
    __tablename__ = "board_onboarding_sessions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    board_id: UUID = Field(foreign_key="boards.id", index=True)
    session_key: str
    status: str = Field(default="active", index=True)
    messages: list[dict[str, object]] | None = Field(default=None, sa_column=Column(JSON))
    draft_goal: dict[str, object] | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
