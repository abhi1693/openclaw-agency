"""Calendar event and task schedule models for M11 Shared Calendar System."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.core.time import utcnow
from app.models.tenancy import TenantScoped


class CalendarEvent(TenantScoped, table=True):
    """Organization-wide calendar event: milestone, meeting, deadline, release, or holiday."""

    __tablename__ = "calendar_events"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    board_id: UUID | None = Field(default=None, foreign_key="boards.id", index=True)

    title: str = Field(max_length=512)
    description: str | None = None
    event_type: str = Field(
        default="milestone",
        index=True,
        # event_type values: milestone, meeting, deadline, release, holiday
    )
    starts_at: datetime
    ends_at: datetime | None = None
    is_all_day: bool = Field(default=False)
    recurrence_rule: str | None = Field(default=None, max_length=256)
    event_metadata: dict[str, Any] | None = Field(
        default=None, sa_column=Column("metadata", JSON)
    )

    created_by_user_id: UUID | None = Field(
        default=None,
        foreign_key="users.id",
        index=True,
    )
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class TaskSchedule(TenantScoped, table=True):
    """Task time-slot assignment: maps a task to a specific scheduled window per agent."""

    __tablename__ = "task_schedules"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="tasks.id", index=True)
    agent_id: UUID | None = Field(default=None, foreign_key="agents.id")
    board_id: UUID = Field(foreign_key="boards.id", index=True)

    scheduled_start: datetime
    scheduled_end: datetime
    actual_start: datetime | None = None
    actual_end: datetime | None = None

    status: str = Field(
        default="planned",
        index=True,
        # status values: planned, in_progress, completed, missed
    )
    estimated_hours: float | None = None

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
