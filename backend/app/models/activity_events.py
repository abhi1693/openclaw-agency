"""Activity event model persisted for audit and feed use-cases."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime,)

REDACTED_MESSAGE = "[redacted]"


class ActivityEvent(QueryModel, table=True):
    """Discrete activity event tied to board/task/agent context."""

    __tablename__ = "activity_events"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    event_type: str = Field(index=True)
    message: str | None = None
    agent_id: UUID | None = Field(default=None, foreign_key="agents.id", index=True)
    task_id: UUID | None = Field(default=None, foreign_key="tasks.id", index=True)
    board_id: UUID | None = Field(default=None, foreign_key="boards.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    # Redaction fields (migration a1b2c3d4e5f6)
    redacted_at: datetime | None = Field(default=None, index=True)
    redacted_by_user_id: UUID | None = Field(default=None)
    original_message_hash: str | None = Field(default=None, max_length=64)

    @property
    def is_redacted(self) -> bool:
        return self.redacted_at is not None
