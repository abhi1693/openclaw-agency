"""Calendar API routes: events, schedules, workload, and slot suggestions."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import col, select

from app.api.deps import SESSION_DEP, require_admin_auth
from app.core.time import utcnow
from app.models.calendar_events import CalendarEvent, TaskSchedule
from app.schemas.calendar import (
    AgentWorkloadItem,
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventUpdate,
    CalendarRangeResponse,
    SuggestSlotRequest,
    SuggestSlotResponse,
    TaskScheduleCreate,
    TaskScheduleRead,
    TaskScheduleUpdate,
    WorkloadResponse,
)
from app.schemas.common import OkResponse
from app.services.calendar_service import CalendarService
from app.services.organizations import get_active_membership

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.core.auth import AuthContext

router = APIRouter(prefix="/calendar", tags=["calendar"])

ADMIN_AUTH_DEP = Depends(require_admin_auth)


async def _resolve_org_id(
    session: AsyncSession,
    auth: AuthContext,
) -> UUID:
    """Resolve the organization ID from the authenticated user context."""
    if auth.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    member = await get_active_membership(session, auth.user)
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return member.organization_id


@router.get("/events", response_model=CalendarRangeResponse)
async def list_calendar_events(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    board_id: UUID | None = Query(default=None),
    agent_id: UUID | None = Query(default=None),
    event_type: str | None = Query(default=None),
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> CalendarRangeResponse:
    """List calendar events and task schedules for a date range."""
    org_id = await _resolve_org_id(session, auth)

    # Query calendar events
    event_stmt = (
        select(CalendarEvent)
        .where(col(CalendarEvent.organization_id) == org_id)
        .where(col(CalendarEvent.starts_at) < end_date)
    )
    if board_id is not None:
        event_stmt = event_stmt.where(col(CalendarEvent.board_id) == board_id)
    if event_type is not None:
        event_stmt = event_stmt.where(col(CalendarEvent.event_type) == event_type)

    events = list((await session.exec(event_stmt)).all())

    # Query task schedules
    sched_stmt = (
        select(TaskSchedule)
        .where(col(TaskSchedule.scheduled_start) < end_date)
        .where(col(TaskSchedule.scheduled_end) > start_date)
    )
    if board_id is not None:
        sched_stmt = sched_stmt.where(col(TaskSchedule.board_id) == board_id)
    if agent_id is not None:
        sched_stmt = sched_stmt.where(col(TaskSchedule.agent_id) == agent_id)

    schedules = list((await session.exec(sched_stmt)).all())

    return CalendarRangeResponse(
        events=[CalendarEventRead.model_validate(e) for e in events],
        schedules=[TaskScheduleRead.model_validate(s) for s in schedules],
    )


@router.post("/events", response_model=CalendarEventRead, status_code=status.HTTP_201_CREATED)
async def create_calendar_event(
    payload: CalendarEventCreate,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> CalendarEventRead:
    """Create a new calendar event."""
    org_id = await _resolve_org_id(session, auth)
    data = payload.model_dump()
    event = CalendarEvent(
        **data,
        organization_id=org_id,
        created_by_user_id=auth.user.id if auth.user else None,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return CalendarEventRead.model_validate(event)


@router.patch("/events/{event_id}", response_model=CalendarEventRead)
async def update_calendar_event(
    event_id: UUID,
    payload: CalendarEventUpdate,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> CalendarEventRead:
    """Update a calendar event."""
    org_id = await _resolve_org_id(session, auth)
    event = await _get_event_or_404(session, event_id=event_id, org_id=org_id)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(event, key, value)
    event.updated_at = utcnow()
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return CalendarEventRead.model_validate(event)


@router.delete("/events/{event_id}", response_model=OkResponse)
async def delete_calendar_event(
    event_id: UUID,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> OkResponse:
    """Delete a calendar event."""
    org_id = await _resolve_org_id(session, auth)
    event = await _get_event_or_404(session, event_id=event_id, org_id=org_id)
    await session.delete(event)
    await session.commit()
    return OkResponse()


@router.get("/schedules", response_model=list[TaskScheduleRead])
async def list_task_schedules(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    agent_id: UUID | None = Query(default=None),
    board_id: UUID | None = Query(default=None),
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> list[TaskScheduleRead]:
    """List task schedules in the given date range."""
    stmt = (
        select(TaskSchedule)
        .where(col(TaskSchedule.scheduled_start) < end_date)
        .where(col(TaskSchedule.scheduled_end) > start_date)
    )
    if agent_id is not None:
        stmt = stmt.where(col(TaskSchedule.agent_id) == agent_id)
    if board_id is not None:
        stmt = stmt.where(col(TaskSchedule.board_id) == board_id)

    schedules = list((await session.exec(stmt)).all())
    return [TaskScheduleRead.model_validate(s) for s in schedules]


@router.post(
    "/schedules", response_model=TaskScheduleRead, status_code=status.HTTP_201_CREATED
)
async def create_task_schedule(
    payload: TaskScheduleCreate,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> TaskScheduleRead:
    """Create a task schedule, detecting any conflicts first."""
    if payload.scheduled_end <= payload.scheduled_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="scheduled_end must be after scheduled_start.",
        )

    if payload.agent_id is not None:
        svc = CalendarService(session)
        conflicts = await svc.detect_conflicts(
            payload.agent_id, payload.scheduled_start, payload.scheduled_end
        )
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Schedule conflicts with existing agent schedules.",
                    "conflict_ids": [str(c.id) for c in conflicts],
                },
            )

    data = payload.model_dump()
    schedule = TaskSchedule(**data)
    session.add(schedule)
    await session.commit()
    await session.refresh(schedule)
    return TaskScheduleRead.model_validate(schedule)


@router.patch("/schedules/{schedule_id}", response_model=TaskScheduleRead)
async def update_task_schedule(
    schedule_id: UUID,
    payload: TaskScheduleUpdate,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> TaskScheduleRead:
    """Update a task schedule."""
    schedule = await _get_schedule_or_404(session, schedule_id=schedule_id)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(schedule, key, value)
    schedule.updated_at = utcnow()
    session.add(schedule)
    await session.commit()
    await session.refresh(schedule)
    return TaskScheduleRead.model_validate(schedule)


@router.delete("/schedules/{schedule_id}", response_model=OkResponse)
async def delete_task_schedule(
    schedule_id: UUID,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> OkResponse:
    """Delete a task schedule."""
    schedule = await _get_schedule_or_404(session, schedule_id=schedule_id)
    await session.delete(schedule)
    await session.commit()
    return OkResponse()


@router.get("/workload", response_model=WorkloadResponse)
async def get_agent_workload(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    agent_ids: list[UUID] = Query(default_factory=list, alias="agent_ids[]"),
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> WorkloadResponse:
    """Calculate scheduled hours per agent in the given date range."""
    svc = CalendarService(session)
    raw = await svc.calculate_workload(agent_ids, start_date, end_date)
    workload = {
        str(agent_id): AgentWorkloadItem(
            hours_scheduled=float(data["hours_scheduled"]),  # type: ignore[arg-type]
            schedule_ids=list(data["schedule_ids"]),  # type: ignore[arg-type]
        )
        for agent_id, data in raw.items()
    }
    return WorkloadResponse(workload=workload)


@router.post("/suggest-slot", response_model=SuggestSlotResponse)
async def suggest_slot(
    payload: SuggestSlotRequest,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> SuggestSlotResponse:
    """Suggest the next available time slot for an agent."""
    svc = CalendarService(session)
    suggested_start, suggested_end, conflicts = await svc.suggest_optimal_slot(
        agent_id=payload.agent_id,
        duration_hours=payload.duration_hours,
        preferred_after=payload.preferred_after,
        preferred_before=payload.preferred_before,
    )
    return SuggestSlotResponse(
        suggested_start=suggested_start,
        suggested_end=suggested_end,
        conflicts=[TaskScheduleRead.model_validate(c) for c in conflicts],
    )


async def _get_event_or_404(
    session: AsyncSession,
    *,
    event_id: UUID,
    org_id: UUID,
) -> CalendarEvent:
    event = (
        await session.exec(
            select(CalendarEvent)
            .where(col(CalendarEvent.id) == event_id)
            .where(col(CalendarEvent.organization_id) == org_id)
        )
    ).first()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return event


async def _get_schedule_or_404(
    session: AsyncSession,
    *,
    schedule_id: UUID,
) -> TaskSchedule:
    schedule = (
        await session.exec(
            select(TaskSchedule).where(col(TaskSchedule.id) == schedule_id)
        )
    ).first()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return schedule
