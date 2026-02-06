from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import asc, case, func, or_
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.api.deps import ActorContext, get_board_or_404, require_admin_auth, require_admin_or_agent
from app.core.auth import AuthContext
from app.core.time import utcnow
from app.db.pagination import paginate
from app.db.session import async_session_maker, get_session
from app.models.approvals import Approval
from app.models.boards import Board
from app.schemas.approvals import ApprovalCreate, ApprovalRead, ApprovalStatus, ApprovalUpdate
from app.schemas.pagination import DefaultLimitOffsetPage

router = APIRouter(prefix="/boards/{board_id}/approvals", tags=["approvals"])

TASK_ID_KEYS: tuple[str, ...] = ("task_id", "taskId", "taskID")


def _extract_task_id(payload: dict[str, object] | None) -> UUID | None:
    if not payload:
        return None
    for key in TASK_ID_KEYS:
        value = payload.get(key)
        if isinstance(value, UUID):
            return value
        if isinstance(value, str):
            try:
                return UUID(value)
            except ValueError:
                continue
    return None


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


def _approval_updated_at(approval: Approval) -> datetime:
    return approval.resolved_at or approval.created_at


def _serialize_approval(approval: Approval) -> dict[str, object]:
    return ApprovalRead.model_validate(approval, from_attributes=True).model_dump(mode="json")


async def _fetch_approval_events(
    session: AsyncSession,
    board_id: UUID,
    since: datetime,
) -> list[Approval]:
    statement = (
        select(Approval)
        .where(col(Approval.board_id) == board_id)
        .where(
            or_(
                col(Approval.created_at) >= since,
                col(Approval.resolved_at) >= since,
            )
        )
        .order_by(asc(col(Approval.created_at)))
    )
    return list(await session.exec(statement))


@router.get("", response_model=DefaultLimitOffsetPage[ApprovalRead])
async def list_approvals(
    status_filter: ApprovalStatus | None = Query(default=None, alias="status"),
    board: Board = Depends(get_board_or_404),
    session: AsyncSession = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> DefaultLimitOffsetPage[ApprovalRead]:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    statement = select(Approval).where(col(Approval.board_id) == board.id)
    if status_filter:
        statement = statement.where(col(Approval.status) == status_filter)
    statement = statement.order_by(col(Approval.created_at).desc())
    return await paginate(session, statement)


@router.get("/stream")
async def stream_approvals(
    request: Request,
    board: Board = Depends(get_board_or_404),
    actor: ActorContext = Depends(require_admin_or_agent),
    since: str | None = Query(default=None),
) -> EventSourceResponse:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    since_dt = _parse_since(since) or utcnow()
    last_seen = since_dt

    async def event_generator() -> AsyncIterator[dict[str, str]]:
        nonlocal last_seen
        while True:
            if await request.is_disconnected():
                break
            async with async_session_maker() as session:
                approvals = await _fetch_approval_events(session, board.id, last_seen)
                pending_approvals_count = int(
                    (
                        await session.exec(
                            select(func.count(col(Approval.id)))
                            .where(col(Approval.board_id) == board.id)
                            .where(col(Approval.status) == "pending")
                        )
                    ).one()
                )
                task_ids = {
                    approval.task_id for approval in approvals if approval.task_id is not None
                }
                counts_by_task_id: dict[UUID, tuple[int, int]] = {}
                if task_ids:
                    rows = list(
                        await session.exec(
                            select(
                                col(Approval.task_id),
                                func.count(col(Approval.id)).label("total"),
                                func.sum(
                                    case((col(Approval.status) == "pending", 1), else_=0)
                                ).label("pending"),
                            )
                            .where(col(Approval.board_id) == board.id)
                            .where(col(Approval.task_id).in_(task_ids))
                            .group_by(col(Approval.task_id))
                        )
                    )
                    for task_id, total, pending in rows:
                        if task_id is None:
                            continue
                        counts_by_task_id[task_id] = (int(total or 0), int(pending or 0))
            for approval in approvals:
                updated_at = _approval_updated_at(approval)
                if updated_at > last_seen:
                    last_seen = updated_at
                payload: dict[str, object] = {
                    "approval": _serialize_approval(approval),
                    "pending_approvals_count": pending_approvals_count,
                }
                if approval.task_id is not None:
                    counts = counts_by_task_id.get(approval.task_id)
                    if counts is not None:
                        total, pending = counts
                        payload["task_counts"] = {
                            "task_id": str(approval.task_id),
                            "approvals_count": total,
                            "approvals_pending_count": pending,
                        }
                yield {"event": "approval", "data": json.dumps(payload)}
            await asyncio.sleep(2)

    return EventSourceResponse(event_generator(), ping=15)


@router.post("", response_model=ApprovalRead)
async def create_approval(
    payload: ApprovalCreate,
    board: Board = Depends(get_board_or_404),
    session: AsyncSession = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> Approval:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    task_id = payload.task_id or _extract_task_id(payload.payload)
    approval = Approval(
        board_id=board.id,
        task_id=task_id,
        agent_id=payload.agent_id,
        action_type=payload.action_type,
        payload=payload.payload,
        confidence=payload.confidence,
        rubric_scores=payload.rubric_scores,
        status=payload.status,
    )
    session.add(approval)
    await session.commit()
    await session.refresh(approval)
    return approval


@router.patch("/{approval_id}", response_model=ApprovalRead)
async def update_approval(
    approval_id: str,
    payload: ApprovalUpdate,
    board: Board = Depends(get_board_or_404),
    session: AsyncSession = Depends(get_session),
    auth: AuthContext = Depends(require_admin_auth),
) -> Approval:
    approval = await session.get(Approval, approval_id)
    if approval is None or approval.board_id != board.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates:
        approval.status = updates["status"]
        if approval.status != "pending":
            approval.resolved_at = utcnow()
    session.add(approval)
    await session.commit()
    await session.refresh(approval)
    return approval
