"""TaskBroadcaster: broadcast task mutations to board subscribers via Redis DB3.

Channel pattern: board_sync:{board_id}

Messages published are plain JSON dicts that match the BoardSyncMessage
protocol defined in frontend/src/lib/board-sync-protocol.ts.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.logging import get_logger

logger = get_logger(__name__)

# Channel prefix for board sync — using Redis DB3 (BOARD_SYNC_REDIS_URL).
_CHANNEL_PREFIX = "board_sync"


def _channel(board_id: UUID) -> str:
    return f"{_CHANNEL_PREFIX}:{board_id}"


def _utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class TaskBroadcaster:
    """Broadcast task mutations to all board sync subscribers via Redis DB3.

    Uses lazy Redis initialization so the app can start even if Redis is
    temporarily unavailable.
    """

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            import redis.asyncio as aioredis  # type: ignore[import-untyped]

            self._client = aioredis.from_url(self._redis_url, decode_responses=True)
        except ImportError:
            logger.warning(
                "task_broadcast.import_error: redis package not installed, "
                "board sync broadcasts disabled"
            )
            return None
        return self._client

    async def _publish(self, board_id: UUID, message: dict[str, Any]) -> bool:
        """Publish a message to the board's pub/sub channel.

        Returns True if published successfully, False otherwise.
        """
        client = self._get_client()
        if client is None:
            return False
        channel = _channel(board_id)
        try:
            await client.publish(channel, json.dumps(message))
            logger.debug("task_broadcast.publish channel=%s type=%s", channel, message.get("type"))
            return True
        except Exception:
            logger.warning(
                "task_broadcast.publish_failed channel=%s", channel, exc_info=True
            )
            return False

    async def broadcast_task_updated(
        self,
        board_id: UUID,
        task_id: UUID,
        changes: dict[str, Any],
        actor: dict[str, Any],
    ) -> None:
        """Broadcast a task.updated event to all board subscribers."""
        await self._publish(
            board_id,
            {
                "type": "task.updated",
                "task_id": str(task_id),
                "changes": changes,
                "updated_by": actor,
                "timestamp": _utc_now_iso(),
            },
        )

    async def broadcast_task_created(
        self,
        board_id: UUID,
        task: dict[str, Any],
    ) -> None:
        """Broadcast a task.created event to all board subscribers."""
        await self._publish(
            board_id,
            {
                "type": "task.created",
                "task": task,
                "timestamp": _utc_now_iso(),
            },
        )

    async def broadcast_task_deleted(
        self,
        board_id: UUID,
        task_id: UUID,
    ) -> None:
        """Broadcast a task.deleted event to all board subscribers."""
        await self._publish(
            board_id,
            {
                "type": "task.deleted",
                "task_id": str(task_id),
                "timestamp": _utc_now_iso(),
            },
        )

    async def broadcast_suggestion(
        self,
        board_id: UUID,
        suggestion: dict[str, Any],
    ) -> None:
        """Broadcast a suggestion.new event to all board subscribers."""
        await self._publish(
            board_id,
            {
                "type": "suggestion.new",
                "suggestion": suggestion,
            },
        )

    async def get_pubsub(self, board_id: UUID) -> Any:
        """Return an async pub/sub object subscribed to the board's channel.

        Caller is responsible for iterating messages and closing the pubsub.
        Returns None if Redis is unavailable.
        """
        client = self._get_client()
        if client is None:
            return None
        channel = _channel(board_id)
        try:
            pubsub = client.pubsub()
            await pubsub.subscribe(channel)
            logger.debug("task_broadcast.subscribe channel=%s", channel)
            return pubsub
        except Exception:
            logger.warning(
                "task_broadcast.subscribe_failed channel=%s", channel, exc_info=True
            )
            return None


def _make_task_broadcaster() -> TaskBroadcaster:
    from app.core.config import settings

    return TaskBroadcaster(redis_url=settings.board_sync_redis_url)


# Module-level singleton — initialized lazily.
task_broadcaster: TaskBroadcaster = _make_task_broadcaster()
