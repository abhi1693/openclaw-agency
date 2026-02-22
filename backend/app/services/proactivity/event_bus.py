"""Redis-backed event bus for the proactivity engine (DB2).

Channel layout:
  mc:events:{org_id}              - org-wide events
  mc:events:{org_id}:{board_id}   - board-scoped events
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_ORG_CHANNEL_PREFIX = "mc:events"


def _org_channel(org_id: UUID) -> str:
    return f"{_ORG_CHANNEL_PREFIX}:{org_id}"


def _board_channel(org_id: UUID, board_id: UUID) -> str:
    return f"{_ORG_CHANNEL_PREFIX}:{org_id}:{board_id}"


class _EventEncoder(json.JSONEncoder):
    """JSON encoder that handles UUID and datetime values."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


@dataclass(frozen=True)
class SystemEvent:
    """Immutable system event published to the Redis event bus."""

    event_type: str
    organization_id: UUID
    board_id: UUID | None
    agent_id: UUID | None
    task_id: UUID | None
    payload: dict[str, Any]
    timestamp: datetime
    event_id: UUID

    def to_json(self) -> str:
        """Serialize event to JSON string."""
        return json.dumps(asdict(self), cls=_EventEncoder)

    @classmethod
    def from_json(cls, data: str) -> SystemEvent:
        """Deserialize event from JSON string."""
        raw = json.loads(data)
        return cls(
            event_type=raw["event_type"],
            organization_id=UUID(raw["organization_id"]),
            board_id=UUID(raw["board_id"]) if raw.get("board_id") else None,
            agent_id=UUID(raw["agent_id"]) if raw.get("agent_id") else None,
            task_id=UUID(raw["task_id"]) if raw.get("task_id") else None,
            payload=raw.get("payload", {}),
            timestamp=datetime.fromisoformat(raw["timestamp"]),
            event_id=UUID(raw["event_id"]),
        )


def _get_redis_client() -> aioredis.Redis:
    """Create a Redis client using the proactivity Redis URL."""
    return aioredis.from_url(
        settings.proactivity_redis_url,
        decode_responses=True,
    )


class EventBus:
    """Redis pub/sub event bus for proactivity events."""

    def __init__(self) -> None:
        self._client: aioredis.Redis | None = None

    def _redis(self) -> aioredis.Redis:
        if self._client is None:
            self._client = _get_redis_client()
        return self._client

    async def publish(self, event: SystemEvent) -> None:
        """Publish a system event to org-wide and (optionally) board-scoped channels."""
        redis = self._redis()
        message = event.to_json()
        org_channel = _org_channel(event.organization_id)
        try:
            await redis.publish(org_channel, message)
            if event.board_id is not None:
                board_channel = _board_channel(event.organization_id, event.board_id)
                await redis.publish(board_channel, message)
        except Exception:
            logger.exception("event_bus.publish.error event_type=%s", event.event_type)

    async def subscribe(
        self,
        org_id: UUID,
        callback: Callable[[SystemEvent], Awaitable[None]],
    ) -> None:
        """Subscribe to all events for an organization and invoke callback for each."""
        redis = _get_redis_client()
        pubsub = redis.pubsub()
        channel = _org_channel(org_id)
        await pubsub.subscribe(channel)
        logger.info("event_bus.subscribed channel=%s", channel)
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    event = SystemEvent.from_json(message["data"])
                    await callback(event)
                except Exception:
                    logger.exception(
                        "event_bus.callback.error channel=%s", channel
                    )
        finally:
            await pubsub.unsubscribe(channel)
            await redis.aclose()

    async def subscribe_all(
        self,
        callback: Callable[[SystemEvent], Awaitable[None]],
    ) -> None:
        """Subscribe to all proactivity events using pattern matching."""
        redis = _get_redis_client()
        pubsub = redis.pubsub()
        pattern = f"{_ORG_CHANNEL_PREFIX}:*"
        await pubsub.psubscribe(pattern)
        logger.info("event_bus.psubscribed pattern=%s", pattern)
        try:
            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                try:
                    event = SystemEvent.from_json(message["data"])
                    await callback(event)
                except Exception:
                    logger.exception("event_bus.callback.error pattern=%s", pattern)
        finally:
            await pubsub.punsubscribe(pattern)
            await redis.aclose()

    async def close(self) -> None:
        """Close the underlying Redis connection."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None


# Module-level singleton used by API handlers
event_bus = EventBus()
