# ruff: noqa: S101
"""Tests for automatic session recovery during gateway sends."""

from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

import app.services.openclaw.gateway_dispatch as gateway_dispatch
import app.services.openclaw.gateway_rpc as gateway_rpc
import app.services.openclaw.session_service as session_service
from app.services.openclaw.gateway_rpc import GatewayConfig as GatewayClientConfig
from app.services.openclaw.gateway_rpc import OpenClawGatewayError


@dataclass
class _FakeSession:
    committed: int = 0
    added: list[object] = field(default_factory=list)

    def add(self, value: object) -> None:
        self.added.append(value)

    async def commit(self) -> None:
        self.committed += 1


@dataclass
class _AgentStub:
    id: UUID
    name: str
    openclaw_session_id: str | None = None
    board_id: UUID | None = None


@pytest.mark.asyncio
async def test_send_message_with_session_recovery_resets_and_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str, str | None]] = []

    async def _fake_send_message(
        message: str,
        *,
        session_key: str,
        config: GatewayClientConfig,
        deliver: bool = False,
    ) -> object:
        _ = (config, deliver)
        calls.append(("send", session_key, message))
        if len([entry for entry in calls if entry[0] == "send"]) == 1:
            raise OpenClawGatewayError("session not found")
        return {"ok": True}

    async def _fake_reset_session(
        session_key: str,
        *,
        config: GatewayClientConfig,
    ) -> object:
        _ = config
        calls.append(("reset", session_key, None))
        return {"reset": True}

    async def _fake_ensure_session(
        session_key: str,
        *,
        config: GatewayClientConfig,
        label: str | None = None,
    ) -> object:
        _ = config
        calls.append(("ensure", session_key, label))
        return {"ensured": True}

    monkeypatch.setattr(gateway_rpc, "send_message", _fake_send_message)
    monkeypatch.setattr(gateway_rpc, "reset_session", _fake_reset_session)
    monkeypatch.setattr(gateway_rpc, "ensure_session", _fake_ensure_session)

    result = await gateway_rpc.send_message_with_session_recovery(
        "Resume this session",
        session_key="agent:test:main",
        config=GatewayClientConfig(url="ws://gateway.example/ws", token=None),
        deliver=True,
        label="Test Agent",
    )

    assert result == {"ok": True}
    assert calls == [
        ("send", "agent:test:main", "Resume this session"),
        ("reset", "agent:test:main", None),
        ("ensure", "agent:test:main", "Test Agent"),
        ("send", "agent:test:main", "Resume this session"),
    ]


@pytest.mark.asyncio
async def test_gateway_dispatch_send_agent_message_uses_recovery_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = _FakeSession()
    service = gateway_dispatch.GatewayDispatchService(session)  # type: ignore[arg-type]
    agent = _AgentStub(id=uuid4(), name="Worker Agent")
    calls: list[tuple[str, str, str | None]] = []

    async def _fake_ensure_session(
        session_key: str,
        *,
        config: GatewayClientConfig,
        label: str | None = None,
    ) -> object:
        _ = config
        calls.append(("ensure", session_key, label))
        return {"ensured": True}

    async def _fake_send_message_with_session_recovery(
        message: str,
        *,
        session_key: str,
        config: GatewayClientConfig,
        deliver: bool = False,
        label: str | None = None,
    ) -> object:
        _ = (config, deliver)
        calls.append(("recover", session_key, label))
        return {"sent": message}

    monkeypatch.setattr(gateway_dispatch, "ensure_session", _fake_ensure_session)
    monkeypatch.setattr(
        gateway_dispatch,
        "send_message_with_session_recovery",
        _fake_send_message_with_session_recovery,
    )

    await service.send_agent_message(
        session_key="agent:worker:main",
        config=GatewayClientConfig(url="ws://gateway.example/ws", token=None),
        agent_name=agent.name,
        message="Please continue",
        deliver=False,
    )

    assert calls == [
        ("ensure", "agent:worker:main", "Worker Agent"),
        ("recover", "agent:worker:main", "Worker Agent"),
    ]


@pytest.mark.asyncio
async def test_gateway_session_send_uses_recovery_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = _FakeSession()
    service = session_service.GatewaySessionService(session)  # type: ignore[arg-type]
    board = SimpleNamespace(
        id=uuid4(),
        organization_id=uuid4(),
        gateway_id=uuid4(),
    )
    calls: list[tuple[str, str, str | None]] = []

    async def _fake_require_gateway(
        self: session_service.GatewaySessionService,
        board_id: str | None,
        *,
        user: object | None = None,
    ) -> tuple[object, GatewayClientConfig, str | None]:
        _ = (self, board_id, user)
        return (
            board,
            GatewayClientConfig(url="ws://gateway.example/ws", token=None),
            "agent:gateway:main",
        )

    async def _fake_require_board_access(
        _session: object,
        *,
        user: object,
        board: object,
        write: bool,
    ) -> None:
        _ = (_session, user, board, write)

    async def _fake_ensure_session(
        session_key: str,
        *,
        config: GatewayClientConfig,
        label: str | None = None,
    ) -> object:
        _ = config
        calls.append(("ensure", session_key, label))
        return {"ensured": True}

    async def _fake_send_message_with_session_recovery(
        message: str,
        *,
        session_key: str,
        config: GatewayClientConfig,
        deliver: bool = False,
        label: str | None = None,
    ) -> object:
        _ = (config, deliver)
        calls.append(("recover", session_key, label))
        return {"sent": message}

    monkeypatch.setattr(
        session_service.GatewaySessionService,
        "require_gateway",
        _fake_require_gateway,
    )
    monkeypatch.setattr(session_service, "require_board_access", _fake_require_board_access)
    monkeypatch.setattr(session_service, "ensure_session", _fake_ensure_session)
    monkeypatch.setattr(
        session_service,
        "send_message_with_session_recovery",
        _fake_send_message_with_session_recovery,
    )

    await service.send_session_message(
        session_id="agent:gateway:main",
        payload=SimpleNamespace(content="Keep going"),
        board_id=str(board.id),
        user=SimpleNamespace(),
    )

    assert calls == [
        ("ensure", "agent:gateway:main", "Gateway Agent"),
        ("recover", "agent:gateway:main", "Gateway Agent"),
    ]
