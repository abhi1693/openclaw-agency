"""Gateway auto-registration REST endpoints and WebSocket relay."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import get_session
from app.schemas.common import OkResponse
from app.schemas.gateway_registration import (
    GatewayDeregisterRequest,
    GatewayHeartbeatRequest,
    GatewayHeartbeatResponse,
    GatewayRegisterRequest,
    GatewayRegisterResponse,
)
from app.services.gateway_registry import (
    _hash_token,
    deregister_gateway,
    process_heartbeat,
    register_gateway,
)
from app.services.gateway_ws_manager import gateway_ws_manager

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

# Lazy imports used in the WebSocket handler; resolved at module-level to
# avoid "possibly unbound" issues across control-flow blocks.
from app.core.time import utcnow as _utcnow
from app.models.gateways import Gateway as _Gateway

logger = get_logger(__name__)

router = APIRouter(prefix="/gateway-registry", tags=["gateway-registry"])
SESSION_DEP = Depends(get_session)


@router.post(
    "/register",
    response_model=GatewayRegisterResponse,
    summary="Register Gateway",
)
async def gateway_register(
    payload: GatewayRegisterRequest,
    session: AsyncSession = SESSION_DEP,
) -> GatewayRegisterResponse:
    """Register a gateway on startup and receive relay credentials."""
    gateway, relay_token = await register_gateway(
        session,
        organization_id=payload.organization_id,
        registration_token=payload.registration_token,
        name=payload.name,
        url=payload.url,
        workspace_root=payload.workspace_root,
        version=payload.version,
        capabilities=payload.capabilities,
    )
    relay_ws_url = f"wss://{settings.base_url}/ws/gateway/{gateway.id}/relay"
    return GatewayRegisterResponse(
        gateway_id=gateway.id,
        relay_ws_url=relay_ws_url,
        relay_token=relay_token,
        heartbeat_interval_seconds=settings.gateway_heartbeat_interval_seconds,
    )


@router.post(
    "/heartbeat",
    response_model=GatewayHeartbeatResponse,
    summary="Gateway Heartbeat",
)
async def gateway_heartbeat(
    payload: GatewayHeartbeatRequest,
    session: AsyncSession = SESSION_DEP,
) -> GatewayHeartbeatResponse:
    """Process a periodic heartbeat from a registered gateway."""
    await process_heartbeat(
        session,
        gateway_id=payload.gateway_id,
        relay_token=payload.relay_token,
        heartbeat_status=payload.status,
        metrics=payload.metrics,
    )
    return GatewayHeartbeatResponse(ok=True)


@router.delete(
    "/deregister",
    response_model=OkResponse,
    summary="Deregister Gateway",
)
async def gateway_deregister(
    payload: GatewayDeregisterRequest,
    session: AsyncSession = SESSION_DEP,
) -> OkResponse:
    """Gracefully deregister a gateway during shutdown."""
    await deregister_gateway(
        session,
        gateway_id=payload.gateway_id,
        relay_token=payload.relay_token,
    )
    return OkResponse()


# ---------------------------------------------------------------------------
# WebSocket relay endpoint
# ---------------------------------------------------------------------------

ws_router = APIRouter(tags=["gateway-ws"])


@ws_router.websocket("/ws/gateway/{gateway_id}/relay")
async def gateway_relay_ws(
    websocket: WebSocket,
    gateway_id: UUID,
) -> None:
    """Persistent WebSocket connection for gateway relay.

    The gateway connects here after registration and maintains the
    connection for bidirectional message forwarding.

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

    if msg.get("type") != "auth":
        await websocket.close(code=4001, reason="expected auth message")
        return

    relay_token = (msg.get("payload") or {}).get("relay_token")
    if not relay_token:
        await websocket.close(code=4001, reason="missing relay_token")
        return

    # Validate relay token against database
    async for session in get_session():
        gateway = await session.get(_Gateway, gateway_id)
        if gateway is None or gateway.token != _hash_token(relay_token):
            await websocket.close(code=4001, reason="invalid credentials")
            return

        # Mark gateway as online
        gateway.status = "online"
        gateway.last_heartbeat_at = _utcnow()
        session.add(gateway)
        await session.commit()
        break

    # Send auth_ok
    await websocket.send_text(
        json.dumps(
            {
                "type": "auth_ok",
                "payload": {
                    "gateway_id": str(gateway_id),
                    "config": {
                        "heartbeat_interval_seconds": settings.gateway_heartbeat_interval_seconds,
                    },
                },
            }
        )
    )

    # Register in the WS manager
    await gateway_ws_manager.register(gateway_id, websocket)

    # --- Message loop ---
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "heartbeat":
                # Implicit heartbeat via WS — no DB write needed, just ack
                await websocket.send_text(
                    json.dumps({"type": "heartbeat_ack", "id": msg.get("id")})
                )
            else:
                # Forward other messages to the relay handler
                logger.debug(
                    "gateway_ws.recv gateway_id=%s type=%s",
                    gateway_id,
                    msg_type,
                )
    except WebSocketDisconnect:
        logger.info("gateway_ws.disconnect gateway_id=%s", gateway_id)
    except Exception:
        logger.warning(
            "gateway_ws.error gateway_id=%s",
            gateway_id,
            exc_info=True,
        )
    finally:
        await gateway_ws_manager.unregister(gateway_id)
        # Mark gateway offline in DB
        try:
            async for session in get_session():
                gw = await session.get(_Gateway, gateway_id)
                if gw is not None and gw.status == "online":
                    gw.status = "offline"
                    gw.updated_at = _utcnow()
                    session.add(gw)
                    await session.commit()
                break
        except Exception:
            logger.warning(
                "gateway_ws.cleanup_failed gateway_id=%s",
                gateway_id,
                exc_info=True,
            )
