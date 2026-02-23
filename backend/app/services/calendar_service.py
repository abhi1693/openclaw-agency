"""Calendar service: conflict detection, workload calculation, optimal slot suggestion."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from sqlmodel import col, select

from app.models.calendar_events import TaskSchedule

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

WORK_DAY_START_HOUR = 9
WORK_DAY_END_HOUR = 18
SLOT_STEP_MINUTES = 30
MAX_SLOT_SEARCH_DAYS = 14


class CalendarService:
    """Business logic for calendar conflict detection, workload, and slot suggestions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def detect_conflicts(
        self,
        agent_id: UUID,
        start: datetime,
        end: datetime,
        exclude_schedule_id: UUID | None = None,
    ) -> list[TaskSchedule]:
        """Return existing schedules for agent_id that overlap [start, end)."""
        statement = (
            select(TaskSchedule)
            .where(col(TaskSchedule.agent_id) == agent_id)
            .where(col(TaskSchedule.scheduled_start) < end)
            .where(col(TaskSchedule.scheduled_end) > start)
            .where(col(TaskSchedule.status).not_in(["completed", "missed"]))
        )
        if exclude_schedule_id is not None:
            statement = statement.where(col(TaskSchedule.id) != exclude_schedule_id)
        result = await self._session.exec(statement)
        return list(result.all())

    async def calculate_workload(
        self,
        agent_ids: list[UUID],
        start: datetime,
        end: datetime,
    ) -> dict[UUID, dict[str, object]]:
        """Calculate scheduled hours and schedule IDs per agent in the given window."""
        if not agent_ids:
            return {}

        statement = (
            select(TaskSchedule)
            .where(col(TaskSchedule.agent_id).in_(agent_ids))
            .where(col(TaskSchedule.scheduled_start) < end)
            .where(col(TaskSchedule.scheduled_end) > start)
        )
        result = await self._session.exec(statement)
        schedules = list(result.all())

        workload: dict[UUID, dict[str, object]] = {
            agent_id: {"hours_scheduled": 0.0, "schedule_ids": []}
            for agent_id in agent_ids
        }
        for schedule in schedules:
            if schedule.agent_id is None:
                continue
            agent_data = workload[schedule.agent_id]
            overlap_start = max(schedule.scheduled_start, start)
            overlap_end = min(schedule.scheduled_end, end)
            hours = (overlap_end - overlap_start).total_seconds() / 3600.0
            agent_data["hours_scheduled"] = float(agent_data["hours_scheduled"]) + hours  # type: ignore[arg-type]
            cast_ids: list[UUID] = agent_data["schedule_ids"]  # type: ignore[assignment]
            cast_ids.append(schedule.id)

        return workload

    async def suggest_optimal_slot(
        self,
        agent_id: UUID,
        duration_hours: float,
        preferred_after: datetime | None = None,
        preferred_before: datetime | None = None,
    ) -> tuple[datetime, datetime, list[TaskSchedule]]:
        """Find the earliest conflict-free slot of the requested duration.

        Searches working hours (09:00–18:00) in 30-minute increments starting
        from ``preferred_after`` (or now) up to MAX_SLOT_SEARCH_DAYS days out.
        Returns (start, end, conflicts_at_chosen_slot).
        """
        from app.core.time import utcnow

        search_start = preferred_after or utcnow()
        search_end_limit = preferred_before or (
            search_start + timedelta(days=MAX_SLOT_SEARCH_DAYS)
        )

        # Snap to next 30-minute boundary
        candidate = _snap_to_slot_boundary(search_start)

        duration = timedelta(hours=duration_hours)

        while candidate < search_end_limit:
            slot_end = candidate + duration

            # Keep within working hours
            if candidate.hour >= WORK_DAY_END_HOUR or slot_end.hour > WORK_DAY_END_HOUR:
                # Move to next day's work start
                candidate = _next_work_day_start(candidate)
                continue

            if candidate.hour < WORK_DAY_START_HOUR:
                candidate = candidate.replace(
                    hour=WORK_DAY_START_HOUR, minute=0, second=0, microsecond=0
                )
                continue

            conflicts = await self.detect_conflicts(agent_id, candidate, slot_end)
            if not conflicts:
                return candidate, slot_end, []

            # Skip past the latest conflicting schedule
            latest_conflict_end = max(c.scheduled_end for c in conflicts)
            candidate = _snap_to_slot_boundary(latest_conflict_end)

        # Fallback: return the preferred_after slot even if it has conflicts
        fallback_start = preferred_after or search_start
        fallback_end = fallback_start + duration
        conflicts = await self.detect_conflicts(agent_id, fallback_start, fallback_end)
        return fallback_start, fallback_end, conflicts


def _snap_to_slot_boundary(dt: datetime) -> datetime:
    """Round dt up to the next SLOT_STEP_MINUTES boundary."""
    step = SLOT_STEP_MINUTES
    remainder = dt.minute % step
    if remainder == 0 and dt.second == 0 and dt.microsecond == 0:
        return dt.replace(second=0, microsecond=0)
    added_minutes = step - remainder
    snapped = dt.replace(second=0, microsecond=0) + timedelta(minutes=added_minutes)
    return snapped


def _next_work_day_start(dt: datetime) -> datetime:
    """Return the start of the next calendar day's working hours."""
    next_day = (dt + timedelta(days=1)).replace(
        hour=WORK_DAY_START_HOUR, minute=0, second=0, microsecond=0
    )
    return next_day
