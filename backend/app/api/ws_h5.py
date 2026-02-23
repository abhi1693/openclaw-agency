"""WebSocket endpoint for H5 client chat connections (M4).

Endpoint: /ws/h5/chat

Auth handshake:
  Client sends: { "type": "auth", "payload": { "token": "<H5 JWT>" } }
  Server replies: { "type": "auth_ok", ... } or closes with 4001.

After auth, the client can send chat messages:
  { "type": "chat", "id": "...", "payload": { "agent_id": "...", "content": "..." } }
"""

from __future__ import annotations

import json
from uuid import UUID

import jwt as pyjwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.h5_auth import decode_h5_access_token
from app.core.logging import get_logger
from app.db.session import get_session
from app.services.ws_relay import protocol
from app.services.ws_relay.connection_manager import h5_connection_manager
from app.services.ws_relay.message_router import message_router

logger = get_logger(__name__)

ws_router = APIRouter(tags=["h5-ws"])


@ws_router.websocket("/ws/h5/chat")
async def h5_chat_ws(websocket: WebSocket) -> None:
    """Persistent WebSocket connection for H5 user chat.

    After a successful auth handshake the connection is registered and the
    server relays chat messages between the H5 client and the assigned gateway.
    """
    await websocket.accept()

    # --- Auth handshake ---
    try:
        raw = await websocket.receive_text()
        msg = json.loads(raw)
    except Exception:
        await websocket.send_text(protocol.serialize(protocol.auth_error("invalid auth message")))
        await websocket.close(code=4001, reason="invalid auth message")
        return

    if msg.get("type") != protocol.MSG_AUTH:
        await websocket.send_text(protocol.serialize(protocol.auth_error("expected auth message")))
        await websocket.close(code=4001, reason="expected auth message")
        return

    token = protocol.extract_h5_token(msg)
    if not token:
        await websocket.send_text(protocol.serialize(protocol.auth_error("missing token")))
        await websocket.close(code=4001, reason="missing token")
        return

    try:
        payload = decode_h5_access_token(token)
    except pyjwt.PyJWTError as exc:
        logger.info("h5_ws.auth_failed reason=%s", exc)
        await websocket.send_text(
            protocol.serialize(protocol.auth_error("invalid or expired token"))
        )
        await websocket.close(code=4001, reason="invalid or expired token")
        return

    h5_user_id = UUID(payload["sub"])
    organization_id = UUID(payload["org"])

    # Send auth_ok
    await websocket.send_text(
        protocol.serialize(
            protocol.auth_ok(
                {
                    "h5_user_id": str(h5_user_id),
                    "organization_id": str(organization_id),
                }
            )
        )
    )

    # Register connection
    await h5_connection_manager.connect(h5_user_id, websocket)

    # --- Message loop ---
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = protocol.deserialize(raw)
            except ValueError:
                await websocket.send_text(protocol.serialize(protocol.error_msg("invalid JSON")))
                continue

            msg_type = msg.get("type")

            if msg_type == protocol.MSG_HEARTBEAT:
                await websocket.send_text(protocol.serialize(protocol.heartbeat_ack(msg.get("id"))))

            elif msg_type == protocol.MSG_CHAT:
                msg_payload = msg.get("payload") or {}
                agent_id_str = msg_payload.get("agent_id")
                content = msg_payload.get("content", "")

                if not agent_id_str or not content:
                    await websocket.send_text(
                        protocol.serialize(protocol.error_msg("missing agent_id or content"))
                    )
                    continue

                try:
                    agent_id = UUID(agent_id_str)
                except ValueError:
                    await websocket.send_text(
                        protocol.serialize(protocol.error_msg("invalid agent_id"))
                    )
                    continue

                async for db in get_session():
                    sent = await message_router.route_h5_to_agent(
                        db,
                        h5_user_id=h5_user_id,
                        agent_id=agent_id,
                        content=content,
                        message_id=msg.get("id"),
                    )
                    if not sent:
                        await websocket.send_text(
                            protocol.serialize(
                                protocol.error_msg("failed to route message to agent")
                            )
                        )
                    break

            else:
                logger.debug(
                    "h5_ws.unknown_message_type type=%s h5_user_id=%s",
                    msg_type,
                    h5_user_id,
                )

    except WebSocketDisconnect:
        logger.info("h5_ws.disconnect h5_user_id=%s", h5_user_id)
    except Exception:
        logger.warning("h5_ws.error h5_user_id=%s", h5_user_id, exc_info=True)
    finally:
        h5_connection_manager.disconnect(h5_user_id)
