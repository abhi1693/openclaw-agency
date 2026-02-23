# ruff: noqa: INP001
"""Tests for M11 Shared Calendar System.

Covers: conflict detection, workload calculation, optimal slot suggestion,
and calendar event/schedule CRUD endpoints.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.services.calendar_service import (
    CalendarService,
    _next_work_day_start,
    _snap_to_slot_boundary,
)


# ---------------------------------------------------------------------------
# Unit tests for CalendarService helpers
# ---------------------------------------------------------------------------


def _dt(hour: int, minute: int = 0) -> datetime:
    """Return a naive UTC datetime on 2026-02-23 at the given hour/minute."""
    return datetime(2026, 2, 23, hour, minute, 0, tzinfo=UTC).replace(tzinfo=None)


class TestSnapToSlotBoundary:
    def test_already_on_boundary(self) -> None:
        dt = _dt(9, 0)
        result = _snap_to_slot_boundary(dt)
        assert result == _dt(9, 0)

    def test_snaps_up_to_30(self) -> None:
        dt = _dt(9, 10)
        result = _snap_to_slot_boundary(dt)
        assert result == _dt(9, 30)

    def test_snaps_up_to_next_hour(self) -> None:
        dt = _dt(9, 45)
        result = _snap_to_slot_boundary(dt)
        assert result == _dt(10, 0)

    def test_on_30_boundary(self) -> None:
        dt = _dt(10, 30)
        result = _snap_to_slot_boundary(dt)
        assert result == _dt(10, 30)


class TestNextWorkDayStart:
    def test_advances_one_day(self) -> None:
        dt = _dt(17, 0)
        result = _next_work_day_start(dt)
        assert result.day == dt.day + 1
        assert result.hour == 9
        assert result.minute == 0

    def test_resets_time(self) -> None:
        dt = _dt(22, 45)
        result = _next_work_day_start(dt)
        assert result.hour == 9
        assert result.minute == 0
        assert result.second == 0


class TestConflictDetection:
    """Unit tests for CalendarService.detect_conflicts using mocked sessions."""

    def _make_service(self, schedules: list) -> CalendarService:
        mock_result = MagicMock()
        mock_result.all.return_value = schedules
        mock_session = MagicMock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        svc = CalendarService.__new__(CalendarService)
        svc._session = mock_session
        return svc

    @pytest.mark.asyncio
    async def test_no_conflicts(self) -> None:
        svc = self._make_service([])
        conflicts = await svc.detect_conflicts(uuid4(), _dt(10), _dt(11))
        assert conflicts == []

    @pytest.mark.asyncio
    async def test_returns_conflicts(self) -> None:
        fake_schedule = MagicMock()
        svc = self._make_service([fake_schedule])
        conflicts = await svc.detect_conflicts(uuid4(), _dt(10), _dt(11))
        assert conflicts == [fake_schedule]


class TestWorkloadCalculation:
    """Unit tests for CalendarService.calculate_workload."""

    @pytest.mark.asyncio
    async def test_empty_agent_list(self) -> None:
        mock_session = MagicMock()
        svc = CalendarService.__new__(CalendarService)
        svc._session = mock_session
        result = await svc.calculate_workload([], _dt(9), _dt(18))
        assert result == {}

    @pytest.mark.asyncio
    async def test_calculates_hours(self) -> None:
        agent_id = uuid4()
        schedule_id = uuid4()

        fake_schedule = MagicMock()
        fake_schedule.agent_id = agent_id
        fake_schedule.id = schedule_id
        fake_schedule.scheduled_start = _dt(10)
        fake_schedule.scheduled_end = _dt(12)  # 2 hours

        mock_result = MagicMock()
        mock_result.all.return_value = [fake_schedule]
        mock_session = MagicMock()
        mock_session.exec = AsyncMock(return_value=mock_result)

        svc = CalendarService.__new__(CalendarService)
        svc._session = mock_session

        result = await svc.calculate_workload([agent_id], _dt(9), _dt(18))

        assert agent_id in result
        assert result[agent_id]["hours_scheduled"] == pytest.approx(2.0)
        assert schedule_id in result[agent_id]["schedule_ids"]

    @pytest.mark.asyncio
    async def test_partial_overlap_counts_correctly(self) -> None:
        agent_id = uuid4()
        schedule_id = uuid4()

        # Schedule runs 8:00 - 10:00 but window is 9:00 - 18:00
        fake_schedule = MagicMock()
        fake_schedule.agent_id = agent_id
        fake_schedule.id = schedule_id
        fake_schedule.scheduled_start = _dt(8)
        fake_schedule.scheduled_end = _dt(10)

        mock_result = MagicMock()
        mock_result.all.return_value = [fake_schedule]
        mock_session = MagicMock()
        mock_session.exec = AsyncMock(return_value=mock_result)

        svc = CalendarService.__new__(CalendarService)
        svc._session = mock_session

        result = await svc.calculate_workload([agent_id], _dt(9), _dt(18))

        # Only 1 hour of overlap (9:00 - 10:00)
        assert result[agent_id]["hours_scheduled"] == pytest.approx(1.0)


class TestSuggestOptimalSlot:
    """Unit tests for CalendarService.suggest_optimal_slot."""

    @pytest.mark.asyncio
    async def test_returns_free_slot_when_no_conflicts(self) -> None:
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session = MagicMock()
        mock_session.exec = AsyncMock(return_value=mock_result)

        svc = CalendarService.__new__(CalendarService)
        svc._session = mock_session

        preferred = _dt(10, 0)
        start, end, conflicts = await svc.suggest_optimal_slot(
            agent_id=uuid4(),
            duration_hours=1.0,
            preferred_after=preferred,
        )
        assert start == preferred
        assert end == _dt(11, 0)
        assert conflicts == []

    @pytest.mark.asyncio
    async def test_skips_past_conflict(self) -> None:
        agent_id = uuid4()
        call_count = 0

        conflict_schedule = MagicMock()
        conflict_schedule.scheduled_start = _dt(10, 0)
        conflict_schedule.scheduled_end = _dt(11, 0)
        conflict_schedule.agent_id = agent_id
        conflict_schedule.status = "planned"

        async def _mock_exec(stmt):  # noqa: ANN001
            nonlocal call_count
            call_count += 1
            mock_result = MagicMock()
            # First call: conflict at 10:00-11:00; subsequent: no conflicts
            mock_result.all.return_value = [conflict_schedule] if call_count == 1 else []
            return mock_result

        mock_session = MagicMock()
        mock_session.exec = _mock_exec

        svc = CalendarService.__new__(CalendarService)
        svc._session = mock_session

        start, end, conflicts = await svc.suggest_optimal_slot(
            agent_id=agent_id,
            duration_hours=1.0,
            preferred_after=_dt(10, 0),
        )
        # Should suggest 11:00 (right after the conflict)
        assert start >= _dt(11, 0)
        assert conflicts == []


# ---------------------------------------------------------------------------
# Schema tests
# ---------------------------------------------------------------------------


class TestCalendarSchemas:
    def test_calendar_event_create_defaults(self) -> None:
        from app.schemas.calendar import CalendarEventCreate

        starts = datetime(2026, 3, 1, 10, 0)
        event = CalendarEventCreate(title="Sprint Review", starts_at=starts)
        assert event.event_type == "milestone"
        assert event.is_all_day is False
        assert event.board_id is None

    def test_task_schedule_create(self) -> None:
        from app.schemas.calendar import TaskScheduleCreate

        task_id = uuid4()
        board_id = uuid4()
        s = TaskScheduleCreate(
            task_id=task_id,
            board_id=board_id,
            scheduled_start=datetime(2026, 3, 1, 9, 0),
            scheduled_end=datetime(2026, 3, 1, 11, 0),
            estimated_hours=2.0,
        )
        assert s.task_id == task_id
        assert s.estimated_hours == 2.0

    def test_suggest_slot_request(self) -> None:
        from app.schemas.calendar import SuggestSlotRequest

        req = SuggestSlotRequest(agent_id=uuid4(), duration_hours=2.5)
        assert req.preferred_after is None
        assert req.preferred_before is None

    def test_workload_response(self) -> None:
        from app.schemas.calendar import AgentWorkloadItem, WorkloadResponse

        item = AgentWorkloadItem(hours_scheduled=4.0, schedule_ids=[uuid4()])
        resp = WorkloadResponse(workload={"agent-1": item})
        assert resp.workload["agent-1"].hours_scheduled == 4.0
