from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import asc, or_
from sqlmodel import Session, col, select
from sse_starlette.sse import EventSourceResponse
from starlette.concurrency import run_in_threadpool

from app.api.deps import ActorContext, get_board_or_404, require_admin_auth, require_admin_or_agent
from app.db.session import engine, get_session
from app.models.approvals import Approval
from app.schemas.approvals import ApprovalCreate, ApprovalRead, ApprovalUpdate

router = APIRouter(prefix="/boards/{board_id}/approvals", tags=["approvals"])

ALLOWED_STATUSES = {"pending", "approved", "rejected"}


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


def _fetch_approval_events(
    board_id: UUID,
    since: datetime,
) -> list[Approval]:
    with Session(engine) as session:
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
        return list(session.exec(statement))


@router.get("", response_model=list[ApprovalRead])
def list_approvals(
    status_filter: str | None = Query(default=None, alias="status"),
    board=Depends(get_board_or_404),
    session: Session = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> list[Approval]:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    statement = select(Approval).where(col(Approval.board_id) == board.id)
    if status_filter:
        if status_filter not in ALLOWED_STATUSES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
        statement = statement.where(col(Approval.status) == status_filter)
    statement = statement.order_by(col(Approval.created_at).desc())
    return list(session.exec(statement))


@router.get("/stream")
async def stream_approvals(
    request: Request,
    board=Depends(get_board_or_404),
    actor: ActorContext = Depends(require_admin_or_agent),
    since: str | None = Query(default=None),
) -> EventSourceResponse:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    since_dt = _parse_since(since) or datetime.utcnow()
    last_seen = since_dt

    async def event_generator():
        nonlocal last_seen
        while True:
            if await request.is_disconnected():
                break
            approvals = await run_in_threadpool(_fetch_approval_events, board.id, last_seen)
            for approval in approvals:
                updated_at = _approval_updated_at(approval)
                if updated_at > last_seen:
                    last_seen = updated_at
                payload = {"approval": _serialize_approval(approval)}
                yield {"event": "approval", "data": json.dumps(payload)}
            await asyncio.sleep(2)

    return EventSourceResponse(event_generator(), ping=15)


@router.post("", response_model=ApprovalRead)
def create_approval(
    payload: ApprovalCreate,
    board=Depends(get_board_or_404),
    session: Session = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> Approval:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    approval = Approval(
        board_id=board.id,
        agent_id=payload.agent_id,
        action_type=payload.action_type,
        payload=payload.payload,
        confidence=payload.confidence,
        rubric_scores=payload.rubric_scores,
        status=payload.status,
    )
    session.add(approval)
    session.commit()
    session.refresh(approval)
    return approval


@router.patch("/{approval_id}", response_model=ApprovalRead)
def update_approval(
    approval_id: str,
    payload: ApprovalUpdate,
    board=Depends(get_board_or_404),
    session: Session = Depends(get_session),
    auth=Depends(require_admin_auth),
) -> Approval:
    approval = session.get(Approval, approval_id)
    if approval is None or approval.board_id != board.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates:
        if updates["status"] not in ALLOWED_STATUSES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
        approval.status = updates["status"]
        if approval.status != "pending":
            approval.resolved_at = datetime.utcnow()
    session.add(approval)
    session.commit()
    session.refresh(approval)
    return approval
