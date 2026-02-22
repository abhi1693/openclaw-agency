"""SuggestionService: CRUD and lifecycle management for AgentSuggestion records."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlmodel import col, select

from app.core.time import utcnow
from app.models.agent_suggestions import AgentSuggestion
from app.models.users import User

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# In-memory queues for SSE delivery: {stream_id -> asyncio.Queue}
_sse_queues: dict[str, asyncio.Queue[str]] = {}


class SuggestionService:
    """Manages suggestion creation, resolution, and SSE streaming."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        organization_id: UUID,
        suggestion_type: str,
        title: str,
        description: str | None = None,
        confidence: float = 0.5,
        priority: str = "medium",
        payload: dict | None = None,
        board_id: UUID | None = None,
        agent_id: UUID | None = None,
        source_event_id: UUID | None = None,
        expiry_hours: int = 168,
    ) -> AgentSuggestion:
        """Persist a new suggestion and notify SSE subscribers."""
        from app.core.config import settings

        effective_expiry_hours = (
            settings.proactivity_suggestion_expiry_hours
            if expiry_hours == 168
            else expiry_hours
        )
        now = utcnow()
        suggestion = AgentSuggestion(
            id=uuid4(),
            organization_id=organization_id,
            board_id=board_id,
            agent_id=agent_id,
            suggestion_type=suggestion_type,
            title=title,
            description=description,
            confidence=confidence,
            priority=priority,
            status="pending",
            payload=payload,
            source_event_id=source_event_id,
            expires_at=now + timedelta(hours=effective_expiry_hours),
            created_at=now,
            updated_at=now,
        )
        self._session.add(suggestion)
        await self._session.flush()
        await self._session.refresh(suggestion)

        from app.schemas.agent_suggestions import AgentSuggestionRead

        _notify_sse_subscribers(
            organization_id=organization_id,
            event_type="suggestion.new",
            suggestion=AgentSuggestionRead.model_validate(suggestion, from_attributes=True),
        )
        return suggestion

    async def accept(
        self,
        suggestion_id: UUID,
        *,
        user: User,
    ) -> AgentSuggestion:
        """Mark a pending suggestion as accepted."""
        suggestion = await self._load_or_raise(suggestion_id)
        _require_pending(suggestion)
        now = utcnow()
        suggestion.status = "accepted"
        suggestion.resolved_by_user_id = user.id
        suggestion.resolved_at = now
        suggestion.updated_at = now
        self._session.add(suggestion)
        await self._session.flush()
        await self._session.refresh(suggestion)
        return suggestion

    async def dismiss(
        self,
        suggestion_id: UUID,
        *,
        user: User,
    ) -> AgentSuggestion:
        """Mark a pending suggestion as dismissed."""
        suggestion = await self._load_or_raise(suggestion_id)
        _require_pending(suggestion)
        now = utcnow()
        suggestion.status = "dismissed"
        suggestion.resolved_by_user_id = user.id
        suggestion.resolved_at = now
        suggestion.updated_at = now
        self._session.add(suggestion)
        await self._session.flush()
        await self._session.refresh(suggestion)
        return suggestion

    async def list_pending(
        self,
        organization_id: UUID,
        *,
        status_filter: str | None = None,
        board_id: UUID | None = None,
        priority: str | None = None,
    ) -> list[AgentSuggestion]:
        """Return suggestions for an organization filtered by optional criteria."""
        statement = select(AgentSuggestion).where(
            col(AgentSuggestion.organization_id) == organization_id
        )
        if status_filter:
            statement = statement.where(col(AgentSuggestion.status) == status_filter)
        if board_id:
            statement = statement.where(col(AgentSuggestion.board_id) == board_id)
        if priority:
            statement = statement.where(col(AgentSuggestion.priority) == priority)
        statement = statement.order_by(col(AgentSuggestion.created_at).desc())
        return list(await self._session.exec(statement))

    async def get_by_id(self, suggestion_id: UUID) -> AgentSuggestion | None:
        """Load a suggestion by primary key."""
        return await self._session.get(AgentSuggestion, suggestion_id)

    async def _load_or_raise(self, suggestion_id: UUID) -> AgentSuggestion:
        from fastapi import HTTPException, status

        suggestion = await self._session.get(AgentSuggestion, suggestion_id)
        if suggestion is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return suggestion


def _require_pending(suggestion: AgentSuggestion) -> None:
    from fastapi import HTTPException, status

    if suggestion.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Suggestion is already {suggestion.status}.",
        )


def _notify_sse_subscribers(
    *,
    organization_id: UUID,
    event_type: str,
    suggestion: object,
) -> None:
    """Push SSE event to all active queues for the given organization."""
    from app.schemas.agent_suggestions import AgentSuggestionRead

    if not isinstance(suggestion, AgentSuggestionRead):
        return
    data = json.dumps(
        {
            "type": event_type,
            "suggestion": suggestion.model_dump(mode="json"),
        }
    )
    org_key = str(organization_id)
    for stream_key, queue in list(_sse_queues.items()):
        if stream_key.startswith(org_key):
            try:
                queue.put_nowait(data)
            except asyncio.QueueFull:
                logger.warning("suggestion_service.sse.queue_full stream_key=%s", stream_key)


def register_sse_queue(stream_id: str, queue: asyncio.Queue[str]) -> None:
    """Register an asyncio queue for SSE delivery."""
    _sse_queues[stream_id] = queue


def unregister_sse_queue(stream_id: str) -> None:
    """Remove a previously registered SSE queue."""
    _sse_queues.pop(stream_id, None)
