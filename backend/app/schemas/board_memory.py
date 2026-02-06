from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import SQLModel


class BoardMemoryCreate(SQLModel):
    content: str
    tags: list[str] | None = None
    source: str | None = None


class BoardMemoryRead(BoardMemoryCreate):
    id: UUID
    board_id: UUID
    created_at: datetime
