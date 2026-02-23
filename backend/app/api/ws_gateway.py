"""WebSocket relay endpoint for gateway connections (M4).

Endpoint: /ws/gateway/{gateway_id}/relay

This is separate from the existing gateway_registration.py relay endpoint.
It uses the GatewayPool (M4 relay pool) instead of the legacy GatewayWSManager,
and handles routing of replies back to H5 clients.

Auth handshake:
  Gateway sends: { "type": "auth", "payload": { "relay_token": "..." } }
  Server replies: { "type": "auth_ok", ... } or closes with 4001.
"""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.logging import get_logger
from app.core.time import utcnow
from app.db.session import get_session
from app.models.gateways import Gateway
from app.services.gateway_registry import _hash_token
from app.services.ws_relay import protocol
from app.services.ws_relay.gateway_pool import gateway_pool
from app.services.ws_relay.message_router import message_router

logger = get_logger(__name__)

ws_gateway_router = APIRouter(tags=["gateway-ws"])


@ws_gateway_router.websocket("/ws/gateway/{gateway_id}/relay-m4")
async def gateway_relay_ws_m4(
    websocket: WebSocket,
    gateway_id: UUID,
) -> None:
    """Persistent WebSocket relay connection for gateway (M4 enhanced version).

    Handles incoming chat replies from the gateway and routes them back to
    the originating H5 client via the message router.

    Auth handshake:
      Gateway sends: { "type": "auth", "payload": { "relay_token": "..." } }
      Server replies: { "type": "auth_ok", ... } or closes with 4001.
    """
    await websocket.accept()

    # --- Auth handshake ---
    try:
        raw = await websocket.receive_text()
        msg = json.loads(raw)
    except Exception:
        await websocket.close(code=4001, reason="invalid auth message")
        return

    if msg.get("type") != protocol.MSG_AUTH:
        await websocket.close(code=4001, reason="expected auth message")
        return

    relay_token = protocol.extract_relay_token(msg)
    if not relay_token:
        await websocket.close(code=4001, reason="missing relay_token")
        return

    # Validate relay token against database
    async for db in get_session():
        gateway = await db.get(Gateway, gateway_id)
        if gateway is None or gateway.token != _hash_token(relay_token):
            await websocket.close(code=4001, reason="invalid credentials")
            return

        # Mark gateway as online
        gateway.status = "online"
        gateway.last_heartbeat_at = utcnow()
        db.add(gateway)
        await db.commit()
        break

    # Send auth_ok
    await websocket.send_text(
        protocol.serialize(
            protocol.auth_ok(
                {
                    "gateway_id": str(gateway_id),
                    "config": {
                        "heartbeat_interval_seconds": settings.ws_heartbeat_interval_seconds,
                    },
                }
            )
        )
    )

    # Register in gateway pool
    await gateway_pool.register_gateway(gateway_id, websocket)

    # --- Message loop ---
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = protocol.deserialize(raw)
            except ValueError:
                logger.debug("gateway_relay_m4.invalid_json gateway_id=%s", gateway_id)
                continue

            msg_type = msg.get("type")

            if msg_type == protocol.MSG_HEARTBEAT:
                await websocket.send_text(protocol.serialize(protocol.heartbeat_ack(msg.get("id"))))

            elif msg_type in ("chat.reply", "chat_reply"):
                # Route gateway reply back to the H5 client
                msg_payload = msg.get("payload") or {}
                session_key = msg_payload.get("session_key", "")
                content = msg_payload.get("content", "")

                if session_key and content:
                    async for db in get_session():
                        await message_router.route_gateway_to_h5_with_session(
                            db,
                            session_key=session_key,
                            content=content,
                            message_id=msg.get("id"),
                            extra=msg_payload.get("extra"),
                        )
                        break
                else:
                    logger.debug(
                        "gateway_relay_m4.incomplete_reply gateway_id=%s",
                        gateway_id,
                    )

            else:
                logger.debug(
                    "gateway_relay_m4.recv gateway_id=%s type=%s",
                    gateway_id,
                    msg_type,
                )

    except WebSocketDisconnect:
        logger.info("gateway_relay_m4.disconnect gateway_id=%s", gateway_id)
    except Exception:
        logger.warning("gateway_relay_m4.error gateway_id=%s", gateway_id, exc_info=True)
    finally:
        gateway_pool.unregister_gateway(gateway_id)
        # Mark gateway offline in DB
        try:
            async for db in get_session():
                gw = await db.get(Gateway, gateway_id)
                if gw is not None and gw.status == "online":
                    gw.status = "offline"
                    gw.updated_at = utcnow()
                    db.add(gw)
                    await db.commit()
                break
        except Exception:
            logger.warning(
                "gateway_relay_m4.cleanup_failed gateway_id=%s",
                gateway_id,
                exc_info=True,
            )
