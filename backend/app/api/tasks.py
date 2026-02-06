from __future__ import annotations

import asyncio
import json
from collections import deque
from collections.abc import AsyncIterator, Sequence
from datetime import datetime, timezone
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import asc, delete, desc, or_
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql.expression import Select
from sse_starlette.sse import EventSourceResponse

from app.api.deps import (
    ActorContext,
    get_board_or_404,
    get_task_or_404,
    require_admin_auth,
    require_admin_or_agent,
)
from app.core.auth import AuthContext
from app.core.time import utcnow
from app.db.pagination import paginate
from app.db.session import async_session_maker, get_session
from app.integrations.openclaw_gateway import GatewayConfig as GatewayClientConfig
from app.integrations.openclaw_gateway import OpenClawGatewayError, ensure_session, send_message
from app.models.activity_events import ActivityEvent
from app.models.agents import Agent
from app.models.approvals import Approval
from app.models.boards import Board
from app.models.gateways import Gateway
from app.models.task_dependencies import TaskDependency
from app.models.task_fingerprints import TaskFingerprint
from app.models.tasks import Task
from app.schemas.common import OkResponse
from app.schemas.errors import BlockedTaskError
from app.schemas.pagination import DefaultLimitOffsetPage
from app.schemas.tasks import TaskCommentCreate, TaskCommentRead, TaskCreate, TaskRead, TaskUpdate
from app.services.activity_log import record_activity
from app.services.mentions import extract_mentions, matches_agent_mention
from app.services.task_dependencies import (
    blocked_by_dependency_ids,
    dependency_ids_by_task_id,
    dependency_status_by_id,
    dependent_task_ids,
    replace_task_dependencies,
    validate_dependency_update,
)

router = APIRouter(prefix="/boards/{board_id}/tasks", tags=["tasks"])

ALLOWED_STATUSES = {"inbox", "in_progress", "review", "done"}
TASK_EVENT_TYPES = {
    "task.created",
    "task.updated",
    "task.status_changed",
    "task.comment",
}
SSE_SEEN_MAX = 2000


def _comment_validation_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Comment is required.",
    )


def _blocked_task_error(blocked_by_task_ids: Sequence[UUID]) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "message": "Task is blocked by incomplete dependencies.",
            "blocked_by_task_ids": [str(value) for value in blocked_by_task_ids],
        },
    )


async def has_valid_recent_comment(
    session: AsyncSession,
    task: Task,
    agent_id: UUID | None,
    since: datetime | None,
) -> bool:
    if agent_id is None or since is None:
        return False
    statement = (
        select(ActivityEvent)
        .where(col(ActivityEvent.task_id) == task.id)
        .where(col(ActivityEvent.event_type) == "task.comment")
        .where(col(ActivityEvent.agent_id) == agent_id)
        .where(col(ActivityEvent.created_at) >= since)
        .order_by(desc(col(ActivityEvent.created_at)))
    )
    event = (await session.exec(statement)).first()
    if event is None or event.message is None:
        return False
    return bool(event.message.strip())


def _parse_since(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    normalized = normalized.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


async def _lead_was_mentioned(
    session: AsyncSession,
    task: Task,
    lead: Agent,
) -> bool:
    statement = (
        select(ActivityEvent.message)
        .where(col(ActivityEvent.task_id) == task.id)
        .where(col(ActivityEvent.event_type) == "task.comment")
        .order_by(desc(col(ActivityEvent.created_at)))
    )
    for message in await session.exec(statement):
        if not message:
            continue
        mentions = extract_mentions(message)
        if matches_agent_mention(lead, mentions):
            return True
    return False


def _lead_created_task(task: Task, lead: Agent) -> bool:
    if not task.auto_created or not task.auto_reason:
        return False
    return task.auto_reason == f"lead_agent:{lead.id}"


async def _reconcile_dependents_for_dependency_toggle(
    session: AsyncSession,
    *,
    board_id: UUID,
    dependency_task: Task,
    previous_status: str,
    actor_agent_id: UUID | None,
) -> None:
    done_toggled = (previous_status == "done") != (dependency_task.status == "done")
    if not done_toggled:
        return

    dependent_ids = await dependent_task_ids(
        session,
        board_id=board_id,
        dependency_task_id=dependency_task.id,
    )
    if not dependent_ids:
        return

    dependents = list(
        await session.exec(
            select(Task)
            .where(col(Task.board_id) == board_id)
            .where(col(Task.id).in_(dependent_ids))
        )
    )
    reopened = previous_status == "done" and dependency_task.status != "done"

    for dependent in dependents:
        if dependent.status == "done":
            continue
        if reopened:
            should_reset = (
                dependent.status != "inbox"
                or dependent.assigned_agent_id is not None
                or dependent.in_progress_at is not None
            )
            if should_reset:
                dependent.status = "inbox"
                dependent.assigned_agent_id = None
                dependent.in_progress_at = None
                dependent.updated_at = utcnow()
                session.add(dependent)
                record_activity(
                    session,
                    event_type="task.status_changed",
                    task_id=dependent.id,
                    message=f"Task returned to inbox: dependency reopened ({dependency_task.title}).",
                    agent_id=actor_agent_id,
                )
            else:
                record_activity(
                    session,
                    event_type="task.updated",
                    task_id=dependent.id,
                    message=f"Dependency completion changed: {dependency_task.title}.",
                    agent_id=actor_agent_id,
                )
        else:
            record_activity(
                session,
                event_type="task.updated",
                task_id=dependent.id,
                message=f"Dependency completion changed: {dependency_task.title}.",
                agent_id=actor_agent_id,
            )


async def _fetch_task_events(
    session: AsyncSession,
    board_id: UUID,
    since: datetime,
) -> list[tuple[ActivityEvent, Task | None]]:
    task_ids = list(await session.exec(select(Task.id).where(col(Task.board_id) == board_id)))
    if not task_ids:
        return []
    statement = cast(
        Select[tuple[ActivityEvent, Task | None]],
        select(ActivityEvent, Task)
        .outerjoin(Task, col(ActivityEvent.task_id) == col(Task.id))
        .where(col(ActivityEvent.task_id).in_(task_ids))
        .where(col(ActivityEvent.event_type).in_(TASK_EVENT_TYPES))
        .where(col(ActivityEvent.created_at) >= since)
        .order_by(asc(col(ActivityEvent.created_at))),
    )
    return list(await session.exec(statement))


def _serialize_comment(event: ActivityEvent) -> dict[str, object]:
    return TaskCommentRead.model_validate(event).model_dump(mode="json")


async def _gateway_config(session: AsyncSession, board: Board) -> GatewayClientConfig | None:
    if not board.gateway_id:
        return None
    gateway = await session.get(Gateway, board.gateway_id)
    if gateway is None or not gateway.url:
        return None
    return GatewayClientConfig(url=gateway.url, token=gateway.token)


async def _send_lead_task_message(
    *,
    session_key: str,
    config: GatewayClientConfig,
    message: str,
) -> None:
    await ensure_session(session_key, config=config, label="Lead Agent")
    await send_message(message, session_key=session_key, config=config, deliver=False)


async def _send_agent_task_message(
    *,
    session_key: str,
    config: GatewayClientConfig,
    agent_name: str,
    message: str,
) -> None:
    await ensure_session(session_key, config=config, label=agent_name)
    await send_message(message, session_key=session_key, config=config, deliver=False)


async def _notify_agent_on_task_assign(
    *,
    session: AsyncSession,
    board: Board,
    task: Task,
    agent: Agent,
) -> None:
    if not agent.openclaw_session_id:
        return
    config = await _gateway_config(session, board)
    if config is None:
        return
    description = (task.description or "").strip()
    if len(description) > 500:
        description = f"{description[:497]}..."
    details = [
        f"Board: {board.name}",
        f"Task: {task.title}",
        f"Task ID: {task.id}",
        f"Status: {task.status}",
    ]
    if description:
        details.append(f"Description: {description}")
    message = (
        "TASK ASSIGNED\n"
        + "\n".join(details)
        + "\n\nTake action: open the task and begin work. Post updates as task comments."
    )
    try:
        await _send_agent_task_message(
            session_key=agent.openclaw_session_id,
            config=config,
            agent_name=agent.name,
            message=message,
        )
        record_activity(
            session,
            event_type="task.assignee_notified",
            message=f"Agent notified for assignment: {agent.name}.",
            agent_id=agent.id,
            task_id=task.id,
        )
        await session.commit()
    except OpenClawGatewayError as exc:
        record_activity(
            session,
            event_type="task.assignee_notify_failed",
            message=f"Assignee notify failed: {exc}",
            agent_id=agent.id,
            task_id=task.id,
        )
        await session.commit()


async def _notify_lead_on_task_create(
    *,
    session: AsyncSession,
    board: Board,
    task: Task,
) -> None:
    lead = (
        await session.exec(
            select(Agent)
            .where(Agent.board_id == board.id)
            .where(col(Agent.is_board_lead).is_(True))
        )
    ).first()
    if lead is None or not lead.openclaw_session_id:
        return
    config = await _gateway_config(session, board)
    if config is None:
        return
    description = (task.description or "").strip()
    if len(description) > 500:
        description = f"{description[:497]}..."
    details = [
        f"Board: {board.name}",
        f"Task: {task.title}",
        f"Task ID: {task.id}",
        f"Status: {task.status}",
    ]
    if description:
        details.append(f"Description: {description}")
    message = (
        "NEW TASK ADDED\n"
        + "\n".join(details)
        + "\n\nTake action: triage, assign, or plan next steps."
    )
    try:
        await _send_lead_task_message(
            session_key=lead.openclaw_session_id,
            config=config,
            message=message,
        )
        record_activity(
            session,
            event_type="task.lead_notified",
            message=f"Lead agent notified for task: {task.title}.",
            agent_id=lead.id,
            task_id=task.id,
        )
        await session.commit()
    except OpenClawGatewayError as exc:
        record_activity(
            session,
            event_type="task.lead_notify_failed",
            message=f"Lead notify failed: {exc}",
            agent_id=lead.id,
            task_id=task.id,
        )
        await session.commit()


async def _notify_lead_on_task_unassigned(
    *,
    session: AsyncSession,
    board: Board,
    task: Task,
) -> None:
    lead = (
        await session.exec(
            select(Agent)
            .where(Agent.board_id == board.id)
            .where(col(Agent.is_board_lead).is_(True))
        )
    ).first()
    if lead is None or not lead.openclaw_session_id:
        return
    config = await _gateway_config(session, board)
    if config is None:
        return
    description = (task.description or "").strip()
    if len(description) > 500:
        description = f"{description[:497]}..."
    details = [
        f"Board: {board.name}",
        f"Task: {task.title}",
        f"Task ID: {task.id}",
        f"Status: {task.status}",
    ]
    if description:
        details.append(f"Description: {description}")
    message = (
        "TASK BACK IN INBOX\n"
        + "\n".join(details)
        + "\n\nTake action: assign a new owner or adjust the plan."
    )
    try:
        await _send_lead_task_message(
            session_key=lead.openclaw_session_id,
            config=config,
            message=message,
        )
        record_activity(
            session,
            event_type="task.lead_unassigned_notified",
            message=f"Lead notified task returned to inbox: {task.title}.",
            agent_id=lead.id,
            task_id=task.id,
        )
        await session.commit()
    except OpenClawGatewayError as exc:
        record_activity(
            session,
            event_type="task.lead_unassigned_notify_failed",
            message=f"Lead notify failed: {exc}",
            agent_id=lead.id,
            task_id=task.id,
        )
        await session.commit()


@router.get("/stream")
async def stream_tasks(
    request: Request,
    board: Board = Depends(get_board_or_404),
    actor: ActorContext = Depends(require_admin_or_agent),
    since: str | None = Query(default=None),
) -> EventSourceResponse:
    since_dt = _parse_since(since) or utcnow()
    seen_ids: set[UUID] = set()
    seen_queue: deque[UUID] = deque()

    async def event_generator() -> AsyncIterator[dict[str, str]]:
        last_seen = since_dt
        while True:
            if await request.is_disconnected():
                break
            deps_map: dict[UUID, list[UUID]] = {}
            dep_status: dict[UUID, str] = {}
            async with async_session_maker() as session:
                rows = await _fetch_task_events(session, board.id, last_seen)
                task_ids = [
                    task.id
                    for event, task in rows
                    if task is not None and event.event_type != "task.comment"
                ]
                if task_ids:
                    deps_map = await dependency_ids_by_task_id(
                        session,
                        board_id=board.id,
                        task_ids=list({*task_ids}),
                    )
                    dep_ids: list[UUID] = []
                    for value in deps_map.values():
                        dep_ids.extend(value)
                    if dep_ids:
                        dep_status = await dependency_status_by_id(
                            session,
                            board_id=board.id,
                            dependency_ids=list({*dep_ids}),
                        )
            for event, task in rows:
                if event.id in seen_ids:
                    continue
                seen_ids.add(event.id)
                seen_queue.append(event.id)
                if len(seen_queue) > SSE_SEEN_MAX:
                    oldest = seen_queue.popleft()
                    seen_ids.discard(oldest)
                if event.created_at > last_seen:
                    last_seen = event.created_at
                payload: dict[str, object] = {"type": event.event_type}
                if event.event_type == "task.comment":
                    payload["comment"] = _serialize_comment(event)
                else:
                    if task is None:
                        payload["task"] = None
                    else:
                        dep_list = deps_map.get(task.id, [])
                        blocked_by = blocked_by_dependency_ids(
                            dependency_ids=dep_list,
                            status_by_id=dep_status,
                        )
                        if task.status == "done":
                            blocked_by = []
                        payload["task"] = (
                            TaskRead.model_validate(task, from_attributes=True)
                            .model_copy(
                                update={
                                    "depends_on_task_ids": dep_list,
                                    "blocked_by_task_ids": blocked_by,
                                    "is_blocked": bool(blocked_by),
                                }
                            )
                            .model_dump(mode="json")
                        )
                yield {"event": "task", "data": json.dumps(payload)}
            await asyncio.sleep(2)

    return EventSourceResponse(event_generator(), ping=15)


@router.get("", response_model=DefaultLimitOffsetPage[TaskRead])
async def list_tasks(
    status_filter: str | None = Query(default=None, alias="status"),
    assigned_agent_id: UUID | None = None,
    unassigned: bool | None = None,
    board: Board = Depends(get_board_or_404),
    session: AsyncSession = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> DefaultLimitOffsetPage[TaskRead]:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    statement = select(Task).where(Task.board_id == board.id)
    if status_filter:
        statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
        if statuses:
            if any(status_value not in ALLOWED_STATUSES for status_value in statuses):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Unsupported task status filter.",
                )
            statement = statement.where(col(Task.status).in_(statuses))
    if assigned_agent_id is not None:
        statement = statement.where(col(Task.assigned_agent_id) == assigned_agent_id)
    if unassigned:
        statement = statement.where(col(Task.assigned_agent_id).is_(None))
    statement = statement.order_by(col(Task.created_at).desc())

    async def _transform(items: Sequence[object]) -> Sequence[object]:
        tasks = cast(Sequence[Task], items)
        if not tasks:
            return []
        task_ids = [task.id for task in tasks]
        deps_map = await dependency_ids_by_task_id(session, board_id=board.id, task_ids=task_ids)
        dep_ids: list[UUID] = []
        for value in deps_map.values():
            dep_ids.extend(value)
        dep_status = await dependency_status_by_id(
            session,
            board_id=board.id,
            dependency_ids=list({*dep_ids}),
        )

        output: list[TaskRead] = []
        for task in tasks:
            dep_list = deps_map.get(task.id, [])
            blocked_by = blocked_by_dependency_ids(dependency_ids=dep_list, status_by_id=dep_status)
            if task.status == "done":
                blocked_by = []
            output.append(
                TaskRead.model_validate(task, from_attributes=True).model_copy(
                    update={
                        "depends_on_task_ids": dep_list,
                        "blocked_by_task_ids": blocked_by,
                        "is_blocked": bool(blocked_by),
                    }
                )
            )
        return output

    return await paginate(session, statement, transformer=_transform)


@router.post("", response_model=TaskRead, responses={409: {"model": BlockedTaskError}})
async def create_task(
    payload: TaskCreate,
    board: Board = Depends(get_board_or_404),
    session: AsyncSession = Depends(get_session),
    auth: AuthContext = Depends(require_admin_auth),
) -> TaskRead:
    data = payload.model_dump()
    depends_on_task_ids = cast(list[UUID], data.pop("depends_on_task_ids", []) or [])

    task = Task.model_validate(data)
    task.board_id = board.id
    if task.created_by_user_id is None and auth.user is not None:
        task.created_by_user_id = auth.user.id

    normalized_deps = await validate_dependency_update(
        session,
        board_id=board.id,
        task_id=task.id,
        depends_on_task_ids=depends_on_task_ids,
    )
    dep_status = await dependency_status_by_id(
        session,
        board_id=board.id,
        dependency_ids=normalized_deps,
    )
    blocked_by = blocked_by_dependency_ids(dependency_ids=normalized_deps, status_by_id=dep_status)
    if blocked_by and (task.assigned_agent_id is not None or task.status != "inbox"):
        raise _blocked_task_error(blocked_by)
    session.add(task)
    for dep_id in normalized_deps:
        session.add(
            TaskDependency(
                board_id=board.id,
                task_id=task.id,
                depends_on_task_id=dep_id,
            )
        )
    await session.commit()
    await session.refresh(task)

    record_activity(
        session,
        event_type="task.created",
        task_id=task.id,
        message=f"Task created: {task.title}.",
    )
    await session.commit()
    await _notify_lead_on_task_create(session=session, board=board, task=task)
    if task.assigned_agent_id:
        assigned_agent = await session.get(Agent, task.assigned_agent_id)
        if assigned_agent:
            await _notify_agent_on_task_assign(
                session=session,
                board=board,
                task=task,
                agent=assigned_agent,
            )
    return TaskRead.model_validate(task, from_attributes=True).model_copy(
        update={
            "depends_on_task_ids": normalized_deps,
            "blocked_by_task_ids": blocked_by,
            "is_blocked": bool(blocked_by),
        }
    )


@router.patch(
    "/{task_id}",
    response_model=TaskRead,
    responses={409: {"model": BlockedTaskError}},
)
async def update_task(
    payload: TaskUpdate,
    task: Task = Depends(get_task_or_404),
    session: AsyncSession = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> TaskRead:
    if task.board_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Task board_id is required.",
        )
    board_id = task.board_id

    previous_status = task.status
    previous_assigned = task.assigned_agent_id
    updates = payload.model_dump(exclude_unset=True)
    comment = updates.pop("comment", None)
    depends_on_task_ids = cast(list[UUID] | None, updates.pop("depends_on_task_ids", None))

    requested_fields = set(updates)
    if comment is not None:
        requested_fields.add("comment")
    if depends_on_task_ids is not None:
        requested_fields.add("depends_on_task_ids")

    async def _current_dep_ids() -> list[UUID]:
        deps_map = await dependency_ids_by_task_id(session, board_id=board_id, task_ids=[task.id])
        return deps_map.get(task.id, [])

    async def _blocked_by(dep_ids: Sequence[UUID]) -> list[UUID]:
        if not dep_ids:
            return []
        dep_status = await dependency_status_by_id(
            session,
            board_id=board_id,
            dependency_ids=list(dep_ids),
        )
        return blocked_by_dependency_ids(dependency_ids=list(dep_ids), status_by_id=dep_status)

    # Lead agent: delegation only (assign/unassign, resolve review, manage dependencies).
    if actor.actor_type == "agent" and actor.agent and actor.agent.is_board_lead:
        allowed_fields = {"assigned_agent_id", "status", "depends_on_task_ids"}
        if comment is not None or not requested_fields.issubset(allowed_fields):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Board leads can only assign/unassign tasks, update dependencies, or resolve review tasks."
                ),
            )

        normalized_deps: list[UUID] | None = None
        if depends_on_task_ids is not None:
            if task.status == "done":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=("Cannot change task dependencies after a task is done."),
                )
            normalized_deps = await replace_task_dependencies(
                session,
                board_id=board_id,
                task_id=task.id,
                depends_on_task_ids=depends_on_task_ids,
            )

        effective_deps = (
            normalized_deps if normalized_deps is not None else await _current_dep_ids()
        )
        blocked_by = await _blocked_by(effective_deps)

        # Blocked tasks cannot be assigned or moved out of inbox (unless already done).
        if blocked_by and task.status != "done":
            task.status = "inbox"
            task.assigned_agent_id = None
            task.in_progress_at = None
        else:
            if "assigned_agent_id" in updates:
                assigned_id = updates["assigned_agent_id"]
                if assigned_id:
                    agent = await session.get(Agent, assigned_id)
                    if agent is None:
                        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
                    if agent.is_board_lead:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Board leads cannot assign tasks to themselves.",
                        )
                    if agent.board_id and task.board_id and agent.board_id != task.board_id:
                        raise HTTPException(status_code=status.HTTP_409_CONFLICT)
                    task.assigned_agent_id = agent.id
                else:
                    task.assigned_agent_id = None

            if "status" in updates:
                if task.status != "review":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Board leads can only change status when a task is in review.",
                    )
                if updates["status"] not in {"done", "inbox"}:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Board leads can only move review tasks to done or inbox.",
                    )
                if updates["status"] == "inbox":
                    task.assigned_agent_id = None
                    task.in_progress_at = None
                task.status = updates["status"]

        task.updated_at = utcnow()
        session.add(task)
        if task.status != previous_status:
            event_type = "task.status_changed"
            message = f"Task moved to {task.status}: {task.title}."
        else:
            event_type = "task.updated"
            message = f"Task updated: {task.title}."
        record_activity(
            session,
            event_type=event_type,
            task_id=task.id,
            message=message,
            agent_id=actor.agent.id,
        )
        await _reconcile_dependents_for_dependency_toggle(
            session,
            board_id=board_id,
            dependency_task=task,
            previous_status=previous_status,
            actor_agent_id=actor.agent.id,
        )
        await session.commit()
        await session.refresh(task)

        if task.assigned_agent_id and task.assigned_agent_id != previous_assigned:
            assigned_agent = await session.get(Agent, task.assigned_agent_id)
            if assigned_agent:
                board = await session.get(Board, task.board_id) if task.board_id else None
                if board:
                    await _notify_agent_on_task_assign(
                        session=session,
                        board=board,
                        task=task,
                        agent=assigned_agent,
                    )

        dep_ids = await _current_dep_ids()
        blocked_ids = await _blocked_by(dep_ids)
        if task.status == "done":
            blocked_ids = []
        return TaskRead.model_validate(task, from_attributes=True).model_copy(
            update={
                "depends_on_task_ids": dep_ids,
                "blocked_by_task_ids": blocked_ids,
                "is_blocked": bool(blocked_ids),
            }
        )

    # Non-lead agent: can only change status + comment, and cannot start blocked tasks.
    if actor.actor_type == "agent":
        if actor.agent and actor.agent.board_id and task.board_id:
            if actor.agent.board_id != task.board_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        allowed_fields = {"status", "comment"}
        if depends_on_task_ids is not None or not set(updates).issubset(allowed_fields):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        if "status" in updates:
            if updates["status"] != "inbox":
                dep_ids = await _current_dep_ids()
                blocked_ids = await _blocked_by(dep_ids)
                if blocked_ids:
                    raise _blocked_task_error(blocked_ids)
            if updates["status"] == "inbox":
                task.assigned_agent_id = None
                task.in_progress_at = None
            else:
                task.assigned_agent_id = actor.agent.id if actor.agent else None
                if updates["status"] == "in_progress":
                    task.in_progress_at = utcnow()
    else:
        # Admin user: dependencies can be edited until the task is done.
        admin_normalized_deps: list[UUID] | None = None
        if depends_on_task_ids is not None:
            if task.status == "done":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=("Cannot change task dependencies after a task is done."),
                )
            admin_normalized_deps = await replace_task_dependencies(
                session,
                board_id=board_id,
                task_id=task.id,
                depends_on_task_ids=depends_on_task_ids,
            )

        effective_deps = (
            admin_normalized_deps if admin_normalized_deps is not None else await _current_dep_ids()
        )
        blocked_ids = await _blocked_by(effective_deps)

        target_status = cast(str, updates.get("status", task.status))
        if blocked_ids and not (task.status == "done" and target_status == "done"):
            # Blocked tasks cannot be assigned or moved out of inbox. If the task is already in
            # flight, force it back to inbox and unassign it.
            task.status = "inbox"
            task.assigned_agent_id = None
            task.in_progress_at = None
            updates["status"] = "inbox"
            updates["assigned_agent_id"] = None

        if "status" in updates:
            if updates["status"] == "inbox":
                task.assigned_agent_id = None
                task.in_progress_at = None
            elif updates["status"] == "in_progress":
                task.in_progress_at = utcnow()

        if "assigned_agent_id" in updates and updates["assigned_agent_id"]:
            agent = await session.get(Agent, updates["assigned_agent_id"])
            if agent is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
            if agent.board_id and task.board_id and agent.board_id != task.board_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT)

    for key, value in updates.items():
        setattr(task, key, value)
    task.updated_at = utcnow()

    if "status" in updates and updates["status"] == "review":
        if comment is not None and comment.strip():
            if not comment.strip():
                raise _comment_validation_error()
        else:
            if not await has_valid_recent_comment(
                session,
                task,
                task.assigned_agent_id,
                task.in_progress_at,
            ):
                raise _comment_validation_error()

    session.add(task)
    await session.commit()
    await session.refresh(task)

    if comment is not None and comment.strip():
        event = ActivityEvent(
            event_type="task.comment",
            message=comment,
            task_id=task.id,
            agent_id=actor.agent.id if actor.actor_type == "agent" and actor.agent else None,
        )
        session.add(event)
        await session.commit()

    if "status" in updates and task.status != previous_status:
        event_type = "task.status_changed"
        message = f"Task moved to {task.status}: {task.title}."
    else:
        event_type = "task.updated"
        message = f"Task updated: {task.title}."
    actor_agent_id = actor.agent.id if actor.actor_type == "agent" and actor.agent else None
    record_activity(
        session,
        event_type=event_type,
        task_id=task.id,
        message=message,
        agent_id=actor_agent_id,
    )
    await _reconcile_dependents_for_dependency_toggle(
        session,
        board_id=board_id,
        dependency_task=task,
        previous_status=previous_status,
        actor_agent_id=actor_agent_id,
    )
    await session.commit()

    if task.status == "inbox" and task.assigned_agent_id is None:
        if previous_status != "inbox" or previous_assigned is not None:
            board = await session.get(Board, task.board_id) if task.board_id else None
            if board:
                await _notify_lead_on_task_unassigned(
                    session=session,
                    board=board,
                    task=task,
                )
    if task.assigned_agent_id and task.assigned_agent_id != previous_assigned:
        if actor.actor_type == "agent" and actor.agent and task.assigned_agent_id == actor.agent.id:
            # Don't notify the actor about their own assignment.
            pass
        else:
            assigned_agent = await session.get(Agent, task.assigned_agent_id)
            if assigned_agent:
                board = await session.get(Board, task.board_id) if task.board_id else None
                if board:
                    await _notify_agent_on_task_assign(
                        session=session,
                        board=board,
                        task=task,
                        agent=assigned_agent,
                    )

    dep_ids = await _current_dep_ids()
    blocked_ids = await _blocked_by(dep_ids)
    if task.status == "done":
        blocked_ids = []
    return TaskRead.model_validate(task, from_attributes=True).model_copy(
        update={
            "depends_on_task_ids": dep_ids,
            "blocked_by_task_ids": blocked_ids,
            "is_blocked": bool(blocked_ids),
        }
    )


@router.delete("/{task_id}", response_model=OkResponse)
async def delete_task(
    session: AsyncSession = Depends(get_session),
    task: Task = Depends(get_task_or_404),
    auth: AuthContext = Depends(require_admin_auth),
) -> OkResponse:
    await session.execute(delete(ActivityEvent).where(col(ActivityEvent.task_id) == task.id))
    await session.execute(delete(TaskFingerprint).where(col(TaskFingerprint.task_id) == task.id))
    await session.execute(delete(Approval).where(col(Approval.task_id) == task.id))
    await session.execute(
        delete(TaskDependency).where(
            or_(
                col(TaskDependency.task_id) == task.id,
                col(TaskDependency.depends_on_task_id) == task.id,
            )
        )
    )
    await session.delete(task)
    await session.commit()
    return OkResponse()


@router.get("/{task_id}/comments", response_model=DefaultLimitOffsetPage[TaskCommentRead])
async def list_task_comments(
    task: Task = Depends(get_task_or_404),
    session: AsyncSession = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> DefaultLimitOffsetPage[TaskCommentRead]:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and task.board_id and actor.agent.board_id != task.board_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    statement = (
        select(ActivityEvent)
        .where(col(ActivityEvent.task_id) == task.id)
        .where(col(ActivityEvent.event_type) == "task.comment")
        .order_by(asc(col(ActivityEvent.created_at)))
    )
    return await paginate(session, statement)


@router.post("/{task_id}/comments", response_model=TaskCommentRead)
async def create_task_comment(
    payload: TaskCommentCreate,
    task: Task = Depends(get_task_or_404),
    session: AsyncSession = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> ActivityEvent:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.is_board_lead and task.status != "review":
            if not await _lead_was_mentioned(session, task, actor.agent) and not _lead_created_task(
                task, actor.agent
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        "Board leads can only comment during review, when mentioned, or on tasks they created."
                    ),
                )
        if actor.agent.board_id and task.board_id and actor.agent.board_id != task.board_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    event = ActivityEvent(
        event_type="task.comment",
        message=payload.message,
        task_id=task.id,
        agent_id=actor.agent.id if actor.actor_type == "agent" and actor.agent else None,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    mention_names = extract_mentions(payload.message)
    targets: dict[UUID, Agent] = {}
    if mention_names and task.board_id:
        statement = select(Agent).where(col(Agent.board_id) == task.board_id)
        for agent in await session.exec(statement):
            if matches_agent_mention(agent, mention_names):
                targets[agent.id] = agent
    if not mention_names and task.assigned_agent_id:
        assigned_agent = await session.get(Agent, task.assigned_agent_id)
        if assigned_agent:
            targets[assigned_agent.id] = assigned_agent
    if actor.actor_type == "agent" and actor.agent:
        targets.pop(actor.agent.id, None)
    if targets:
        board = await session.get(Board, task.board_id) if task.board_id else None
        config = await _gateway_config(session, board) if board else None
        if board and config:
            snippet = payload.message.strip()
            if len(snippet) > 500:
                snippet = f"{snippet[:497]}..."
            actor_name = actor.agent.name if actor.actor_type == "agent" and actor.agent else "User"
            for agent in targets.values():
                if not agent.openclaw_session_id:
                    continue
                mentioned = matches_agent_mention(agent, mention_names)
                header = "TASK MENTION" if mentioned else "NEW TASK COMMENT"
                action_line = (
                    "You were mentioned in this comment."
                    if mentioned
                    else "A new comment was posted on your task."
                )
                message = (
                    f"{header}\n"
                    f"Board: {board.name}\n"
                    f"Task: {task.title}\n"
                    f"Task ID: {task.id}\n"
                    f"From: {actor_name}\n\n"
                    f"{action_line}\n\n"
                    f"Comment:\n{snippet}\n\n"
                    "If you are mentioned but not assigned, reply in the task thread but do not change task status."
                )
                try:
                    await _send_agent_task_message(
                        session_key=agent.openclaw_session_id,
                        config=config,
                        agent_name=agent.name,
                        message=message,
                    )
                except OpenClawGatewayError:
                    pass
    return event
