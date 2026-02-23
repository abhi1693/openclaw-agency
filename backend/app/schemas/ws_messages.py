"""WebSocket message schemas for H5 chat relay (M4)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlmodel import SQLModel


class WSMessage(SQLModel):
    """Base envelope for all WebSocket messages."""

    type: str
    id: str | None = None
    payload: dict[str, Any] | None = None
    timestamp: datetime | None = None


class AuthMessage(SQLModel):
    """Client-to-server auth handshake payload."""

    type: str = "auth"
    payload: dict[str, Any]  # {"token": "..."}


class AuthOkMessage(SQLModel):
    """Server-to-client auth success message."""

    type: str = "auth_ok"
    payload: dict[str, Any]


class AuthErrorMessage(SQLModel):
    """Server-to-client auth failure message."""

    type: str = "auth_error"
    payload: dict[str, Any]  # {"reason": "..."}


class ChatMessage(SQLModel):
    """H5 user -> server chat message."""

    type: str = "chat"
    id: str | None = None
    payload: ChatPayload


class ChatPayload(SQLModel):
    """Payload for a chat message."""

    agent_id: UUID
    content: str
    session_id: str | None = None
    role: str = "user"


class HeartbeatMessage(SQLModel):
    """Bidirectional keepalive message."""

    type: str = "heartbeat"
    id: str | None = None


class HeartbeatAckMessage(SQLModel):
    """Heartbeat acknowledgement."""

    type: str = "heartbeat_ack"
    id: str | None = None


class SystemMessage(SQLModel):
    """Server-to-client system notification."""

    type: str = "system"
    payload: dict[str, Any]


class ErrorMessage(SQLModel):
    """Server-to-client error notification."""

    type: str = "error"
    payload: dict[str, Any]  # {"reason": "...", "code": ...}


def make_message_id() -> str:
    """Generate a random message ID."""
    return str(uuid4())
