"""WebSocket endpoint for board real-time sync (M4 STUB for M9).

Endpoint: /ws/board/{board_id}/sync

This is a stub implementation that:
- Accepts connections and authenticates admin JWT (via query param token)
- Returns a board.state message with the current board state
- Keeps the connection alive with heartbeat

Full implementation will be completed in M9.

Auth: Query parameter `token` with a valid admin bearer token.
"""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.logging import get_logger
from app.db.session import get_session
from app.models.boards import Board
from app.services.ws_relay import protocol

logger = get_logger(__name__)

ws_board_router = APIRouter(tags=["board-ws"])


@ws_board_router.websocket("/ws/board/{board_id}/sync")
async def board_sync_ws(
    websocket: WebSocket,
    board_id: UUID,
    token: str | None = Query(default=None),
) -> None:
    """WebSocket endpoint for board real-time sync (stub).

    Authenticates via query param token, returns board state, then keeps
    connection alive with heartbeat. Full real-time sync will be implemented
    in M9.
    """
    await websocket.accept()

    # Minimal auth check — require a non-empty token
    if not token:
        await websocket.send_text(protocol.serialize(protocol.auth_error("missing token")))
        await websocket.close(code=4001, reason="missing token")
        return

    # TODO(M9): Replace with proper admin JWT validation.
    # For now, any non-empty token passes. This stub is for M9 integration.
    logger.info("board_sync_ws.connect board_id=%s", board_id)

    # Fetch board state from DB
    board_state: dict = {}
    async for db in get_session():
        board = await db.get(Board, board_id)
        if board is None:
            await websocket.send_text(
                protocol.serialize(protocol.error_msg("board not found", code=4004))
            )
            await websocket.close(code=4004, reason="board not found")
            return
        board_state = {
            "id": str(board.id),
            "name": board.name,
            "status": board.status,
        }
        break

    # Send initial board state
    await websocket.send_text(
        protocol.serialize(
            {
                "type": protocol.MSG_BOARD_STATE,
                "payload": board_state,
            }
        )
    )

    # --- Keep-alive loop ---
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if msg.get("type") == protocol.MSG_HEARTBEAT:
                await websocket.send_text(protocol.serialize(protocol.heartbeat_ack(msg.get("id"))))
            else:
                logger.debug(
                    "board_sync_ws.recv board_id=%s type=%s",
                    board_id,
                    msg.get("type"),
                )

    except WebSocketDisconnect:
        logger.info("board_sync_ws.disconnect board_id=%s", board_id)
    except Exception:
        logger.warning("board_sync_ws.error board_id=%s", board_id, exc_info=True)
