"""Redis pub/sub bridge for cross-instance WebSocket routing (M4).

Uses Redis DB1 (WS_REDIS_PUBSUB_URL) to route messages to H5 clients
or gateways that may be connected to a different server instance.
"""

from __future__ import annotations

import json
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

# Channel naming pattern: ws:route:{target_type}:{target_id}
# target_type: "h5_user" | "gateway"
_CHANNEL_PREFIX = "ws:route"


def _make_channel(target_type: str, target_id: str) -> str:
    return f"{_CHANNEL_PREFIX}:{target_type}:{target_id}"


class RedisBridge:
    """Pub/sub bridge using Redis for cross-instance WebSocket message delivery.

    Uses lazy initialization — the Redis connection is created on first use
    so the app can start without a Redis connection available.
    """

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._client: Any = None

    def _get_client(self) -> Any:
        """Get or create the Redis client."""
        if self._client is None:
            try:
                import redis.asyncio as aioredis  # type: ignore[import-untyped]

                self._client = aioredis.from_url(self._redis_url, decode_responses=True)
            except ImportError:
                logger.warning(
                    "redis_bridge.import_error: redis package not installed, "
                    "cross-instance routing disabled"
                )
                return None
        return self._client

    async def publish(
        self,
        target_type: str,
        target_id: str,
        message: dict[str, Any],
    ) -> bool:
        """Publish a message to the given target's pub/sub channel.

        Returns True if published, False if Redis is unavailable.
        """
        client = self._get_client()
        if client is None:
            return False
        channel = _make_channel(target_type, target_id)
        try:
            await client.publish(channel, json.dumps(message))
            logger.debug(
                "redis_bridge.publish channel=%s",
                channel,
            )
            return True
        except Exception:
            logger.warning(
                "redis_bridge.publish_failed channel=%s",
                channel,
                exc_info=True,
            )
            return False

    async def subscribe(
        self,
        target_type: str,
        target_id: str,
    ) -> Any:
        """Return an async pub/sub object subscribed to the target's channel.

        Caller is responsible for iterating the channel and closing it.
        Returns None if Redis is unavailable.
        """
        client = self._get_client()
        if client is None:
            return None
        channel = _make_channel(target_type, target_id)
        try:
            pubsub = client.pubsub()
            await pubsub.subscribe(channel)
            logger.debug("redis_bridge.subscribe channel=%s", channel)
            return pubsub
        except Exception:
            logger.warning(
                "redis_bridge.subscribe_failed channel=%s",
                channel,
                exc_info=True,
            )
            return None


def _make_redis_bridge() -> RedisBridge:
    """Create a RedisBridge from settings."""
    from app.core.config import settings

    return RedisBridge(redis_url=settings.ws_redis_pubsub_url)


# Module-level singleton — initialized lazily on first use.
redis_bridge: RedisBridge = _make_redis_bridge()
