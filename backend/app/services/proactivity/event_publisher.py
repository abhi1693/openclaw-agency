"""EventPublisher: thin wrapper used by API handlers to emit system events.

Flow:
  1. Write an AgentEvent row to PostgreSQL (audit log).
  2. Publish the SystemEvent to the Redis event bus (DB2).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from app.core.time import utcnow
from app.models.agent_events import AgentEvent
from app.services.proactivity.event_bus import SystemEvent, event_bus

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)


class EventPublisher:
    """Writes events to the audit log and broadcasts them via the event bus."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def publish(
        self,
        event_type: str,
        organization_id: UUID,
        *,
        board_id: UUID | None = None,
        agent_id: UUID | None = None,
        task_id: UUID | None = None,
        payload: dict | None = None,
    ) -> AgentEvent:
        """Write audit row then broadcast to Redis.

        Returns the persisted AgentEvent ORM row.
        """
        event_payload = payload or {}
        now: datetime = utcnow()
        event_id = uuid4()

        db_event = AgentEvent(
            id=event_id,
            organization_id=organization_id,
            board_id=board_id,
            agent_id=agent_id,
            task_id=task_id,
            event_type=event_type,
            payload=event_payload,
            created_at=now,
        )
        self._session.add(db_event)
        await self._session.flush()

        system_event = SystemEvent(
            event_type=event_type,
            organization_id=organization_id,
            board_id=board_id,
            agent_id=agent_id,
            task_id=task_id,
            payload=event_payload,
            timestamp=now,
            event_id=event_id,
        )
        try:
            await event_bus.publish(system_event)
        except Exception:
            # Publishing to Redis is best-effort; the audit row is already written.
            logger.exception(
                "event_publisher.redis.error event_type=%s org=%s",
                event_type,
                organization_id,
            )

        return db_event
