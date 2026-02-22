"""Agent suggestion endpoints: list, get, accept, dismiss, and SSE stream."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlmodel import col, select
from sse_starlette.sse import EventSourceResponse

from app.api.deps import (
    AGENT_AUTH_OPTIONAL_DEP,
    SESSION_DEP,
    require_admin_auth,
)
from app.core.agent_auth import AgentAuthContext
from app.db.pagination import paginate
from app.models.agent_suggestions import AgentSuggestion
from app.schemas.agent_suggestions import AgentSuggestionCreate, AgentSuggestionRead
from app.schemas.common import OkResponse
from app.schemas.pagination import DefaultLimitOffsetPage
from app.services.organizations import get_active_membership
from app.services.proactivity.suggestion_service import (
    SuggestionService,
    register_sse_queue,
    unregister_sse_queue,
)

if TYPE_CHECKING:
    from fastapi_pagination.limit_offset import LimitOffsetPage
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.core.auth import AuthContext

router = APIRouter(prefix="/suggestions", tags=["suggestions"])

ADMIN_AUTH_DEP = Depends(require_admin_auth)
_SSE_QUEUE_MAX = 128
_SSE_POLL_SECONDS = 2
_SSE_KEEPALIVE_SECONDS = 15


@router.get("", response_model=DefaultLimitOffsetPage[AgentSuggestionRead])
async def list_suggestions(
    status_filter: str | None = Query(default=None, alias="status"),
    board_id: UUID | None = Query(default=None),
    priority: str | None = Query(default=None),
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> LimitOffsetPage[AgentSuggestionRead]:
    """List suggestions with optional filters."""
    if auth.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    member = await get_active_membership(session, auth.user)
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    org_id = member.organization_id

    statement = select(AgentSuggestion).where(
        col(AgentSuggestion.organization_id) == org_id
    )
    if status_filter:
        statement = statement.where(col(AgentSuggestion.status) == status_filter)
    if board_id:
        statement = statement.where(col(AgentSuggestion.board_id) == board_id)
    if priority:
        statement = statement.where(col(AgentSuggestion.priority) == priority)
    statement = statement.order_by(col(AgentSuggestion.created_at).desc())

    return await paginate(session, statement)


@router.get("/stream")
async def stream_suggestions(
    request: Request,
    auth: AuthContext = ADMIN_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> EventSourceResponse:
    """SSE endpoint that delivers new suggestion events to connected clients."""
    if auth.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    member = await get_active_membership(session, auth.user)
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    org_id = member.organization_id
    stream_id = f"{org_id}:{uuid4()}"
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=_SSE_QUEUE_MAX)
    register_sse_queue(stream_id, queue)

    async def _generator() -> AsyncIterator[dict[str, str]]:
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = queue.get_nowait()
                    yield {"event": "suggestion", "data": data}
                except asyncio.QueueEmpty:
                    await asyncio.sleep(_SSE_POLL_SECONDS)
        finally:
            unregister_sse_queue(stream_id)

    return EventSourceResponse(_generator(), ping=_SSE_KEEPALIVE_SECONDS)


@router.get("/{suggestion_id}", response_model=AgentSuggestionRead)
async def get_suggestion(
    suggestion_id: UUID,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> AgentSuggestionRead:
    """Fetch a single suggestion by ID."""
    if auth.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    member = await get_active_membership(session, auth.user)
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    suggestion = await session.get(AgentSuggestion, suggestion_id)
    if suggestion is None or suggestion.organization_id != member.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return AgentSuggestionRead.model_validate(suggestion, from_attributes=True)


@router.post("/{suggestion_id}/accept", response_model=AgentSuggestionRead)
async def accept_suggestion(
    suggestion_id: UUID,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> AgentSuggestionRead:
    """Accept a pending suggestion."""
    if auth.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    member = await get_active_membership(session, auth.user)
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    suggestion = await session.get(AgentSuggestion, suggestion_id)
    if suggestion is None or suggestion.organization_id != member.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    svc = SuggestionService(session)
    updated = await svc.accept(suggestion_id, user=auth.user)
    await session.commit()
    await session.refresh(updated)
    return AgentSuggestionRead.model_validate(updated, from_attributes=True)


@router.post("/{suggestion_id}/dismiss", response_model=OkResponse)
async def dismiss_suggestion(
    suggestion_id: UUID,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> OkResponse:
    """Dismiss a pending suggestion."""
    if auth.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    member = await get_active_membership(session, auth.user)
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    suggestion = await session.get(AgentSuggestion, suggestion_id)
    if suggestion is None or suggestion.organization_id != member.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    svc = SuggestionService(session)
    await svc.dismiss(suggestion_id, user=auth.user)
    await session.commit()
    return OkResponse()


# ---------------------------------------------------------------------------
# Agent-facing endpoint (called by agents via gateway RPC)
# ---------------------------------------------------------------------------

_AGENT_SUGGESTION_ROUTER = APIRouter(prefix="/agent/suggestions", tags=["agent"])


@_AGENT_SUGGESTION_ROUTER.post("", response_model=AgentSuggestionRead)
async def agent_create_suggestion(
    payload: AgentSuggestionCreate,
    agent_auth: AgentAuthContext = AGENT_AUTH_OPTIONAL_DEP,
    session: AsyncSession = SESSION_DEP,
) -> AgentSuggestionRead:
    """Agent-facing endpoint to create suggestions directly."""
    if agent_auth is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    from app.models.boards import Board

    # Resolve org_id from the board or agent's board_id
    board_id = payload.board_id or (
        agent_auth.agent.board_id if agent_auth.agent else None
    )
    org_id: UUID | None = None
    if board_id:
        board = await session.get(Board, board_id)
        if board:
            org_id = board.organization_id
    if org_id is None and agent_auth.agent and agent_auth.agent.board_id:
        board = await session.get(Board, agent_auth.agent.board_id)
        if board:
            org_id = board.organization_id
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot resolve organization for this agent.",
        )
    svc = SuggestionService(session)
    suggestion = await svc.create(
        organization_id=org_id,
        suggestion_type=payload.suggestion_type,
        title=payload.title,
        description=payload.description,
        confidence=payload.confidence,
        priority=payload.priority,
        payload=payload.payload,
        board_id=board_id,
        agent_id=payload.agent_id or (agent_auth.agent.id if agent_auth.agent else None),
    )
    await session.commit()
    await session.refresh(suggestion)
    return AgentSuggestionRead.model_validate(suggestion, from_attributes=True)
