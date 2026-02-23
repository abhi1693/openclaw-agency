"""Gateway WebSocket connection pool for relay (M4).

Manages active WebSocket connections from registered gateways used
for forwarding H5 chat messages.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import WebSocket

from app.core.logging import get_logger

logger = get_logger(__name__)


class GatewayPool:
    """Registry of active gateway WebSocket relay connections.

    Keyed by gateway_id (UUID). A gateway can only maintain one active
    relay connection per instance.
    """

    def __init__(self) -> None:
        self._connections: dict[UUID, WebSocket] = {}

    async def register_gateway(self, gateway_id: UUID, websocket: WebSocket) -> None:
        """Register a gateway WebSocket connection in the pool."""
        old = self._connections.get(gateway_id)
        if old is not None:
            logger.warning(
                "gateway_pool.register.replace gateway_id=%s",
                gateway_id,
            )
            try:
                await old.close(code=1012, reason="replaced by new connection")
            except Exception:
                pass
        self._connections[gateway_id] = websocket
        logger.info(
            "gateway_pool.register gateway_id=%s active=%d",
            gateway_id,
            len(self._connections),
        )

    def unregister_gateway(self, gateway_id: UUID) -> None:
        """Remove a gateway WebSocket connection from the pool."""
        self._connections.pop(gateway_id, None)
        logger.info(
            "gateway_pool.unregister gateway_id=%s active=%d",
            gateway_id,
            len(self._connections),
        )

    def is_gateway_connected(self, gateway_id: UUID) -> bool:
        """Check if a gateway has an active connection in this pool."""
        return gateway_id in self._connections

    async def send_to_gateway(
        self,
        gateway_id: UUID,
        message: dict[str, Any],
    ) -> bool:
        """Send a JSON message to a connected gateway.

        Returns True if sent, False if the gateway is not connected.
        """
        ws = self._connections.get(gateway_id)
        if ws is None:
            return False
        try:
            await ws.send_text(json.dumps(message))
            return True
        except Exception:
            logger.warning(
                "gateway_pool.send_failed gateway_id=%s",
                gateway_id,
                exc_info=True,
            )
            self.unregister_gateway(gateway_id)
            return False

    @property
    def active_count(self) -> int:
        """Number of currently connected gateways in the pool."""
        return len(self._connections)

    def connected_gateway_ids(self) -> list[UUID]:
        """List of currently connected gateway IDs."""
        return list(self._connections.keys())


# Module-level singleton shared across the FastAPI application.
gateway_pool = GatewayPool()
