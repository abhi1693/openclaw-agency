from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class BoardMemory(SQLModel, table=True):
    __tablename__ = "board_memory"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    board_id: UUID = Field(foreign_key="boards.id", index=True)
    content: str
    tags: list[str] | None = Field(default=None, sa_column=Column(JSON))
    source: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
