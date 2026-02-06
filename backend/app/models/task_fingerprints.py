from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class TaskFingerprint(SQLModel, table=True):
    __tablename__ = "task_fingerprints"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    board_id: UUID = Field(foreign_key="boards.id", index=True)
    fingerprint_hash: str = Field(index=True)
    task_id: UUID = Field(foreign_key="tasks.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
