"""In-memory H5 client WebSocket connection manager (M4).

Manages active WebSocket connections from H5 mobile web users.
Thread-safety: all access runs in the same asyncio event loop.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import WebSocket

from app.core.logging import get_logger

logger = get_logger(__name__)


class H5ConnectionManager:
    """Registry of active H5 user WebSocket connections.

    Keys are h5_user_id (UUID). A user can only have one active connection
    per server instance; a new connection replaces the previous one.
    """

    def __init__(self) -> None:
        self._connections: dict[UUID, WebSocket] = {}

    async def connect(self, h5_user_id: UUID, websocket: WebSocket) -> None:
        """Register a new H5 user WebSocket connection."""
        old = self._connections.get(h5_user_id)
        if old is not None:
            logger.warning(
                "h5_ws.connect.replace h5_user_id=%s",
                h5_user_id,
            )
            try:
                await old.close(code=1012, reason="replaced by new connection")
            except Exception:
                pass
        self._connections[h5_user_id] = websocket
        logger.info(
            "h5_ws.connect h5_user_id=%s active=%d",
            h5_user_id,
            len(self._connections),
        )

    def disconnect(self, h5_user_id: UUID) -> None:
        """Remove an H5 user WebSocket connection."""
        self._connections.pop(h5_user_id, None)
        logger.info(
            "h5_ws.disconnect h5_user_id=%s active=%d",
            h5_user_id,
            len(self._connections),
        )

    def is_connected(self, h5_user_id: UUID) -> bool:
        """Check if an H5 user has an active local connection."""
        return h5_user_id in self._connections

    async def send_to_user(
        self,
        h5_user_id: UUID,
        message: dict[str, Any],
    ) -> bool:
        """Send a JSON message to a locally-connected H5 user.

        Returns True if sent, False if the user is not locally connected.
        """
        ws = self._connections.get(h5_user_id)
        if ws is None:
            return False
        try:
            await ws.send_text(json.dumps(message))
            return True
        except Exception:
            logger.warning(
                "h5_ws.send_failed h5_user_id=%s",
                h5_user_id,
                exc_info=True,
            )
            self.disconnect(h5_user_id)
            return False

    async def broadcast_to_users(
        self,
        h5_user_ids: list[UUID],
        message: dict[str, Any],
    ) -> int:
        """Send a message to multiple H5 users. Returns the count of successful sends."""
        sent = 0
        for uid in h5_user_ids:
            if await self.send_to_user(uid, message):
                sent += 1
        return sent

    @property
    def active_count(self) -> int:
        """Number of currently connected H5 users on this instance."""
        return len(self._connections)

    def connected_user_ids(self) -> list[UUID]:
        """List of connected H5 user IDs on this instance."""
        return list(self._connections.keys())


# Module-level singleton shared across the FastAPI application.
h5_connection_manager = H5ConnectionManager()
