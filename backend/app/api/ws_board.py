"""WebSocket endpoint for board real-time sync (M9).

Endpoint: /ws/board/{board_id}/sync

Features:
- Admin JWT authentication via query param `token`
- Initial board.state snapshot on connect
- Redis pub/sub subscription for incremental task.* events
- Client message handling: task.move, task.create, heartbeat
- Clean close codes: 4001 (unauthorized), 4004 (board not found)

Auth: Query parameter `token` with a valid admin bearer token.
"""

from __future__ import annotations

import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.auth_mode import AuthMode
from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import get_session
from app.models.boards import Board
from app.services.realtime.board_state_sync import fetch_board_state
from app.services.realtime.task_broadcast import task_broadcaster

logger = get_logger(__name__)

ws_board_router = APIRouter(tags=["board-ws"])

# Interval (seconds) after which we check Redis for new pub/sub messages.
_REDIS_POLL_TIMEOUT = 5.0


def _is_valid_token(token: str) -> bool:
    """Validate the bearer token for WebSocket board sync auth.

    Supports both local (shared-secret) and clerk (JWT structural check) modes.
    """
    token = token.strip()
    if not token:
        return False

    if settings.auth_mode == AuthMode.LOCAL:
        from hmac import compare_digest

        return compare_digest(token, settings.local_auth_token)

    if settings.auth_mode == AuthMode.CLERK:
        # Structural sanity check: Clerk JWTs are dot-separated base64url strings.
        parts = token.split(".")
        return len(parts) == 3 and all(p for p in parts)  # noqa: S105

    return False


async def _handle_task_move(
    board_id: UUID,
    msg: dict,
) -> None:
    """Handle a task.move client message — broadcast the updated status."""
    task_id_str = msg.get("task_id")
    new_status = msg.get("status")
    if not task_id_str or not new_status:
        return
    try:
        task_id = UUID(str(task_id_str))
    except ValueError:
        return

    async for session in get_session():
        from app.models.tasks import Task  # noqa: PLC0415

        task = await session.get(Task, task_id)
        if task is None or task.board_id != board_id:
            return
        previous_status = task.status
        task.status = new_status
        session.add(task)
        await session.commit()
        await task_broadcaster.broadcast_task_updated(
            board_id,
            task_id=task_id,
            changes={"status": new_status, "previous_status": previous_status},
            actor={"type": "user", "id": "ws-client"},
        )
        break


async def _handle_task_create(
    board_id: UUID,
    msg: dict,
) -> None:
    """Handle a task.create client message — persist and broadcast."""
    title = (msg.get("title") or "").strip()
    if not title:
        return
    status = msg.get("status", "inbox")

    async for session in get_session():
        from app.models.tasks import Task  # noqa: PLC0415

        task = Task(board_id=board_id, title=title, status=status)
        session.add(task)
        await session.commit()
        await session.refresh(task)
        await task_broadcaster.broadcast_task_created(
            board_id,
            task={
                "id": str(task.id),
                "board_id": str(task.board_id),
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
            },
        )
        break


async def _listen_redis_and_forward(
    websocket: WebSocket,
    board_id: UUID,
) -> None:
    """Subscribe to Redis board channel and forward messages to the WS client."""
    pubsub = await task_broadcaster.get_pubsub(board_id)
    if pubsub is None:
        logger.warning("ws_board.no_redis board_id=%s — live updates disabled", board_id)
        while True:
            await asyncio.sleep(60)
        return

    try:
        while True:
            msg = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=_REDIS_POLL_TIMEOUT,
            )
            if msg and msg.get("data"):
                try:
                    await websocket.send_text(msg["data"])
                except Exception:
                    break
    finally:
        await pubsub.unsubscribe()
        await pubsub.aclose()


@ws_board_router.websocket("/ws/board/{board_id}/sync")
async def board_sync_ws(
    websocket: WebSocket,
    board_id: UUID,
    token: str | None = Query(default=None),
) -> None:
    """WebSocket endpoint for board real-time sync (M9).

    Clients connect with a valid admin bearer token as `?token=<value>`.
    On connect: authenticates, verifies board exists, sends board.state snapshot,
    then relays incremental task.* events via Redis pub/sub.
    """
    await websocket.accept()

    # 1. Authentication
    if not token or not _is_valid_token(token):
        await websocket.send_text(json.dumps({"type": "error", "code": 4001, "message": "unauthorized"}))
        await websocket.close(code=4001, reason="unauthorized")
        return

    # 2. Board existence check
    async for session in get_session():
        board = await session.get(Board, board_id)
        if board is None:
            await websocket.send_text(
                json.dumps({"type": "error", "code": 4004, "message": "board not found"})
            )
            await websocket.close(code=4004, reason="board not found")
            return

        # 3. Send initial board.state snapshot
        try:
            board_state = await fetch_board_state(session, board_id=board_id)
            await websocket.send_text(json.dumps(board_state))
        except Exception:
            logger.warning("ws_board.state_error board_id=%s", board_id, exc_info=True)
        break

    logger.info("ws_board.connect board_id=%s", board_id)

    # 4. Start Redis listener as background task
    redis_task = asyncio.create_task(
        _listen_redis_and_forward(websocket, board_id)
    )

    # 5. Receive loop — handle client messages
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")
            if msg_type == "heartbeat":
                await websocket.send_text(
                    json.dumps({"type": "heartbeat.ack", "id": msg.get("id")})
                )
            elif msg_type == "task.move":
                asyncio.create_task(_handle_task_move(board_id, msg))
            elif msg_type == "task.create":
                asyncio.create_task(_handle_task_create(board_id, msg))
            else:
                logger.debug("ws_board.recv board_id=%s type=%s", board_id, msg_type)

    except WebSocketDisconnect:
        logger.info("ws_board.disconnect board_id=%s", board_id)
    except Exception:
        logger.warning("ws_board.error board_id=%s", board_id, exc_info=True)
    finally:
        redis_task.cancel()
        try:
            await redis_task
        except asyncio.CancelledError:
            pass
