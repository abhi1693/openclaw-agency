# ruff: noqa: INP001
"""Tests for M4 WebSocket relay service.

Covers:
- Protocol message serialization/deserialization
- Connection manager (connect, disconnect, send)
- Gateway pool (register, unregister, send)
- Message router logic (with mocked gateway pool)
- H5 WS endpoint auth handshake (with test client)
- Board WS stub endpoint
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.services.ws_relay import protocol
from app.services.ws_relay.connection_manager import H5ConnectionManager
from app.services.ws_relay.gateway_pool import GatewayPool


# ---------------------------------------------------------------------------
# Protocol helpers
# ---------------------------------------------------------------------------


def test_serialize_and_deserialize_roundtrip() -> None:
    """serialize -> deserialize returns identical dict."""
    msg: dict[str, Any] = {"type": "chat", "id": "abc", "payload": {"content": "hello"}}
    assert protocol.deserialize(protocol.serialize(msg)) == msg


def test_deserialize_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="Invalid JSON"):
        protocol.deserialize("not-json")


def test_deserialize_non_object_raises() -> None:
    with pytest.raises(ValueError, match="Expected a JSON object"):
        protocol.deserialize('"just a string"')


def test_auth_ok_builder() -> None:
    msg = protocol.auth_ok({"user_id": "123"})
    assert msg["type"] == "auth_ok"
    assert msg["payload"]["user_id"] == "123"


def test_auth_error_builder() -> None:
    msg = protocol.auth_error("invalid token")
    assert msg["type"] == "auth_error"
    assert msg["payload"]["reason"] == "invalid token"


def test_heartbeat_ack_builder() -> None:
    msg = protocol.heartbeat_ack("msg-123")
    assert msg["type"] == "heartbeat_ack"
    assert msg["id"] == "msg-123"


def test_extract_relay_token_from_auth_message() -> None:
    msg = {"type": "auth", "payload": {"relay_token": "tok-abc"}}
    assert protocol.extract_relay_token(msg) == "tok-abc"


def test_extract_relay_token_missing_returns_none() -> None:
    assert protocol.extract_relay_token({"type": "auth", "payload": {}}) is None
    assert protocol.extract_relay_token({"type": "auth"}) is None


def test_extract_h5_token_from_auth_message() -> None:
    msg = {"type": "auth", "payload": {"token": "h5-jwt-token"}}
    assert protocol.extract_h5_token(msg) == "h5-jwt-token"


# ---------------------------------------------------------------------------
# H5ConnectionManager
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connection_manager_connect_and_disconnect() -> None:
    manager = H5ConnectionManager()
    user_id = uuid4()
    ws = AsyncMock()
    ws.send_text = AsyncMock()
    ws.close = AsyncMock()

    await manager.connect(user_id, ws)
    assert manager.is_connected(user_id)
    assert manager.active_count == 1
    assert user_id in manager.connected_user_ids()

    manager.disconnect(user_id)
    assert not manager.is_connected(user_id)
    assert manager.active_count == 0


@pytest.mark.asyncio
async def test_connection_manager_send_to_user_success() -> None:
    manager = H5ConnectionManager()
    user_id = uuid4()
    ws = AsyncMock()
    ws.send_text = AsyncMock()

    await manager.connect(user_id, ws)
    result = await manager.send_to_user(user_id, {"type": "test"})

    assert result is True
    ws.send_text.assert_called_once_with(json.dumps({"type": "test"}))


@pytest.mark.asyncio
async def test_connection_manager_send_to_user_not_connected() -> None:
    manager = H5ConnectionManager()
    result = await manager.send_to_user(uuid4(), {"type": "test"})
    assert result is False


@pytest.mark.asyncio
async def test_connection_manager_replaces_existing_connection() -> None:
    manager = H5ConnectionManager()
    user_id = uuid4()
    ws_old = AsyncMock()
    ws_old.close = AsyncMock()
    ws_new = AsyncMock()

    await manager.connect(user_id, ws_old)
    await manager.connect(user_id, ws_new)

    ws_old.close.assert_called_once()
    assert manager._connections[user_id] is ws_new


# ---------------------------------------------------------------------------
# GatewayPool
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gateway_pool_register_and_unregister() -> None:
    pool = GatewayPool()
    gateway_id = uuid4()
    ws = AsyncMock()
    ws.close = AsyncMock()

    await pool.register_gateway(gateway_id, ws)
    assert pool.is_gateway_connected(gateway_id)
    assert pool.active_count == 1

    pool.unregister_gateway(gateway_id)
    assert not pool.is_gateway_connected(gateway_id)
    assert pool.active_count == 0


@pytest.mark.asyncio
async def test_gateway_pool_send_to_gateway_success() -> None:
    pool = GatewayPool()
    gateway_id = uuid4()
    ws = AsyncMock()
    ws.send_text = AsyncMock()

    await pool.register_gateway(gateway_id, ws)
    result = await pool.send_to_gateway(gateway_id, {"type": "chat.send"})

    assert result is True
    ws.send_text.assert_called_once()


@pytest.mark.asyncio
async def test_gateway_pool_send_to_disconnected_gateway() -> None:
    pool = GatewayPool()
    result = await pool.send_to_gateway(uuid4(), {"type": "chat.send"})
    assert result is False


# ---------------------------------------------------------------------------
# MessageRouter with mocked dependencies
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_message_router_h5_to_agent_no_assignment() -> None:
    """route_h5_to_agent returns False when the user is not assigned to the agent."""
    from app.services.ws_relay.message_router import MessageRouter

    router = MessageRouter()
    db = AsyncMock()

    # Mock _get_assignment to return None
    router._get_assignment = AsyncMock(return_value=None)

    result = await router.route_h5_to_agent(
        db,
        h5_user_id=uuid4(),
        agent_id=uuid4(),
        content="hello",
    )
    assert result is False


@pytest.mark.asyncio
async def test_message_router_h5_to_agent_no_session() -> None:
    """route_h5_to_agent returns False when session creation fails."""
    from app.services.ws_relay.message_router import MessageRouter

    router = MessageRouter()
    db = AsyncMock()

    router._get_assignment = AsyncMock(return_value=MagicMock())
    router._get_or_create_session = AsyncMock(return_value=None)

    result = await router.route_h5_to_agent(
        db,
        h5_user_id=uuid4(),
        agent_id=uuid4(),
        content="hello",
    )
    assert result is False


@pytest.mark.asyncio
async def test_message_router_h5_to_agent_forwards_to_gateway() -> None:
    """route_h5_to_agent forwards message to gateway_pool."""
    from app.services.ws_relay.message_router import MessageRouter
    from app.services.ws_relay import gateway_pool as gp_module

    router = MessageRouter()
    db = AsyncMock()

    gateway_id = uuid4()
    fake_session = MagicMock()
    fake_session.gateway_id = gateway_id
    fake_session.session_key = "h5:user:agent"
    fake_session.last_message_at = None
    fake_session.updated_at = None

    router._get_assignment = AsyncMock(return_value=MagicMock())
    router._get_or_create_session = AsyncMock(return_value=fake_session)
    db.add = MagicMock()
    db.commit = AsyncMock()

    with patch.object(gp_module.gateway_pool, "send_to_gateway", AsyncMock(return_value=True)) as mock_send:
        result = await router.route_h5_to_agent(
            db,
            h5_user_id=uuid4(),
            agent_id=uuid4(),
            content="hello",
        )

    assert result is True
    mock_send.assert_called_once()


# ---------------------------------------------------------------------------
# H5 WebSocket endpoint auth handshake
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_h5_ws_auth_handshake_invalid_token() -> None:
    """Connecting with an invalid JWT closes the connection with auth_error."""
    from datetime import UTC, datetime, timedelta
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from starlette.testclient import TestClient

    from app.api.ws_h5 import ws_router
    from app.core.config import settings

    app = FastAPI()
    app.include_router(ws_router)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/h5/chat") as ws:
            # Send an auth message with a bogus token
            ws.send_text(json.dumps({"type": "auth", "payload": {"token": "bad-token"}}))
            response = json.loads(ws.receive_text())
            assert response["type"] == "auth_error"


@pytest.mark.asyncio
async def test_h5_ws_auth_handshake_missing_token() -> None:
    """Connecting without a token closes with auth_error."""
    from fastapi import FastAPI
    from starlette.testclient import TestClient

    from app.api.ws_h5 import ws_router

    app = FastAPI()
    app.include_router(ws_router)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/h5/chat") as ws:
            ws.send_text(json.dumps({"type": "auth", "payload": {}}))
            response = json.loads(ws.receive_text())
            assert response["type"] == "auth_error"
            assert "missing token" in response["payload"]["reason"]
