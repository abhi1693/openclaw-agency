"""WebSocket relay protocol constants and message helpers (M4)."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

# ---------------------------------------------------------------------------
# Message type constants
# ---------------------------------------------------------------------------

MSG_AUTH = "auth"
MSG_AUTH_OK = "auth_ok"
MSG_AUTH_ERROR = "auth_error"
MSG_CHAT = "chat"
MSG_CHAT_REPLY = "chat_reply"
MSG_HEARTBEAT = "heartbeat"
MSG_HEARTBEAT_ACK = "heartbeat_ack"
MSG_SYSTEM = "system"
MSG_ERROR = "error"
MSG_BOARD_STATE = "board.state"


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def serialize(message: dict[str, Any]) -> str:
    """Serialize a message dict to JSON string."""
    return json.dumps(message)


def deserialize(raw: str) -> dict[str, Any]:
    """Deserialize a JSON string to a message dict. Raises ValueError on parse failure."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object")
    return data  # type: ignore[return-value]


def make_id() -> str:
    """Generate a random message ID."""
    return str(uuid4())


# ---------------------------------------------------------------------------
# Message builders
# ---------------------------------------------------------------------------


def auth_ok(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": MSG_AUTH_OK, "payload": extra or {}}


def auth_error(reason: str) -> dict[str, Any]:
    return {"type": MSG_AUTH_ERROR, "payload": {"reason": reason}}


def heartbeat_ack(msg_id: str | None = None) -> dict[str, Any]:
    return {"type": MSG_HEARTBEAT_ACK, "id": msg_id}


def error_msg(reason: str, code: int = 4000) -> dict[str, Any]:
    return {"type": MSG_ERROR, "payload": {"reason": reason, "code": code}}


def system_msg(text: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"message": text}
    if extra:
        payload.update(extra)
    return {"type": MSG_SYSTEM, "payload": payload}


# ---------------------------------------------------------------------------
# Auth validation helpers
# ---------------------------------------------------------------------------


def extract_relay_token(msg: dict[str, Any]) -> str | None:
    """Extract relay_token from an auth message payload."""
    payload = msg.get("payload")
    if not isinstance(payload, dict):
        return None
    return payload.get("relay_token") or None


def extract_h5_token(msg: dict[str, Any]) -> str | None:
    """Extract H5 JWT token from an auth message payload."""
    payload = msg.get("payload")
    if not isinstance(payload, dict):
        return None
    return payload.get("token") or None
