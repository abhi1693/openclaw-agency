"""Pydantic schemas for M11 Shared Calendar System API payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlmodel import SQLModel


class CalendarEventBase(SQLModel):
    """Shared calendar event fields."""

    title: str
    description: str | None = None
    event_type: str = "milestone"
    starts_at: datetime
    ends_at: datetime | None = None
    is_all_day: bool = False
    recurrence_rule: str | None = None
    event_metadata: dict[str, Any] | None = None
    board_id: UUID | None = None


class CalendarEventCreate(CalendarEventBase):
    """Payload for creating a calendar event."""


class CalendarEventUpdate(SQLModel):
    """Payload for partial calendar event updates."""

    title: str | None = None
    description: str | None = None
    event_type: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_all_day: bool | None = None
    recurrence_rule: str | None = None
    event_metadata: dict[str, Any] | None = None
    board_id: UUID | None = None


class CalendarEventRead(SQLModel):
    """Response schema for a calendar event."""

    id: UUID
    organization_id: UUID
    board_id: UUID | None
    title: str
    description: str | None
    event_type: str
    starts_at: datetime
    ends_at: datetime | None
    is_all_day: bool
    recurrence_rule: str | None
    event_metadata: dict[str, Any] | None
    created_by_user_id: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskScheduleBase(SQLModel):
    """Shared task schedule fields."""

    task_id: UUID
    agent_id: UUID | None = None
    board_id: UUID
    scheduled_start: datetime
    scheduled_end: datetime
    estimated_hours: float | None = None


class TaskScheduleCreate(TaskScheduleBase):
    """Payload for creating a task schedule."""


class TaskScheduleUpdate(SQLModel):
    """Payload for partial task schedule updates."""

    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    actual_start: datetime | None = None
    actual_end: datetime | None = None
    status: str | None = None
    estimated_hours: float | None = None


class TaskScheduleRead(SQLModel):
    """Response schema for a task schedule."""

    id: UUID
    task_id: UUID
    agent_id: UUID | None
    board_id: UUID
    scheduled_start: datetime
    scheduled_end: datetime
    actual_start: datetime | None
    actual_end: datetime | None
    status: str
    estimated_hours: float | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CalendarRangeResponse(SQLModel):
    """Response with calendar events and task schedules for a date range."""

    events: list[CalendarEventRead]
    schedules: list[TaskScheduleRead]


class AgentWorkloadItem(SQLModel):
    """Workload summary for one agent in a date range."""

    hours_scheduled: float
    schedule_ids: list[UUID]


class WorkloadResponse(SQLModel):
    """Workload response mapping agent_id -> workload summary."""

    workload: dict[str, AgentWorkloadItem]


class SuggestSlotRequest(SQLModel):
    """Request body for optimal slot suggestion."""

    agent_id: UUID
    duration_hours: float
    preferred_after: datetime | None = None
    preferred_before: datetime | None = None


class SuggestSlotResponse(SQLModel):
    """Response with suggested time slot and any conflicts."""

    suggested_start: datetime
    suggested_end: datetime
    conflicts: list[TaskScheduleRead]
