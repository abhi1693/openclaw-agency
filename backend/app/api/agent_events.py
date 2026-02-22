"""Agent-facing endpoint for publishing system events (POST /api/v1/agent/events)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import AGENT_AUTH_OPTIONAL_DEP, SESSION_DEP
from app.core.agent_auth import AgentAuthContext
from app.schemas.agent_events import AgentEventCreate, AgentEventRead
from app.services.proactivity.event_publisher import EventPublisher

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/agent/events", tags=["agent"])


@router.post("", response_model=AgentEventRead, status_code=status.HTTP_201_CREATED)
async def agent_publish_event(
    payload: AgentEventCreate,
    agent_auth: AgentAuthContext = AGENT_AUTH_OPTIONAL_DEP,
    session: AsyncSession = SESSION_DEP,
) -> AgentEventRead:
    """Agent-facing endpoint to publish a system event to the proactivity event bus."""
    if agent_auth is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    from app.models.boards import Board

    # Resolve organization_id from the agent's board
    board_id = payload.board_id or (
        agent_auth.agent.board_id if agent_auth.agent else None
    )
    org_id = None
    if board_id:
        board = await session.get(Board, board_id)
        if board:
            org_id = board.organization_id
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot resolve organization for this agent.",
        )

    publisher = EventPublisher(session)
    event = await publisher.publish(
        event_type=payload.event_type,
        organization_id=org_id,
        board_id=board_id,
        agent_id=payload.agent_id or (agent_auth.agent.id if agent_auth.agent else None),
        task_id=payload.task_id,
        payload=payload.payload,
    )
    await session.commit()
    await session.refresh(event)
    return AgentEventRead.model_validate(event, from_attributes=True)
