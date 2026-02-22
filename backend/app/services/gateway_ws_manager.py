"""Persistent WebSocket connection pool for registered gateways.

Manages the server-side WebSocket connections that gateways maintain
after auto-registration. The gateway initiates the WS connection to
``/ws/gateway/{gateway_id}/relay`` and keeps it open for bidirectional
message forwarding.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from fastapi import WebSocket

from app.core.logging import get_logger

logger = get_logger(__name__)


class GatewayWSManager:
    """In-memory registry of active gateway WebSocket connections.

    Thread-safety: All access is from the same asyncio event loop,
    so a plain dict is safe without locking.
    """

    def __init__(self) -> None:
        self._connections: dict[UUID, WebSocket] = {}

    async def register(self, gateway_id: UUID, websocket: WebSocket) -> None:
        """Register a new gateway WebSocket connection."""
        old = self._connections.get(gateway_id)
        if old is not None:
            logger.warning(
                "gateway_ws.register.replace gateway_id=%s",
                gateway_id,
            )
            try:
                await old.close(code=1012, reason="replaced by new connection")
            except Exception:
                pass
        self._connections[gateway_id] = websocket
        logger.info(
            "gateway_ws.register gateway_id=%s active=%d",
            gateway_id,
            len(self._connections),
        )

    async def unregister(self, gateway_id: UUID) -> None:
        """Remove a gateway WebSocket connection."""
        self._connections.pop(gateway_id, None)
        logger.info(
            "gateway_ws.unregister gateway_id=%s active=%d",
            gateway_id,
            len(self._connections),
        )

    def is_connected(self, gateway_id: UUID) -> bool:
        """Check if a gateway has an active WebSocket connection."""
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
                "gateway_ws.send_failed gateway_id=%s",
                gateway_id,
            )
            await self.unregister(gateway_id)
            return False

    async def receive_from_gateway(
        self,
        gateway_id: UUID,
        timeout: float | None = None,
    ) -> dict[str, Any] | None:
        """Receive a JSON message from a connected gateway.

        Returns None if the gateway is not connected or on timeout.
        """
        ws = self._connections.get(gateway_id)
        if ws is None:
            return None
        try:
            if timeout is not None:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=timeout)
            else:
                raw = await ws.receive_text()
            return json.loads(raw)  # type: ignore[no-any-return]
        except (asyncio.TimeoutError, Exception):
            return None

    @property
    def active_count(self) -> int:
        """Number of currently connected gateways."""
        return len(self._connections)

    def connected_gateway_ids(self) -> list[UUID]:
        """List of currently connected gateway IDs."""
        return list(self._connections.keys())


# Module-level singleton — shared across the FastAPI application.
gateway_ws_manager = GatewayWSManager()
