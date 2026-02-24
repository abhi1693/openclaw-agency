from __future__ import annotations

import pytest

import app.services.openclaw.gateway_rpc as gateway_rpc
from app.services.openclaw.gateway_rpc import (
    CONTROL_UI_CLIENT_ID,
    CONTROL_UI_CLIENT_MODE,
    DEFAULT_GATEWAY_CLIENT_ID,
    DEFAULT_GATEWAY_CLIENT_MODE,
    GATEWAY_OPERATOR_SCOPES,
    GatewayConfig,
    OpenClawGatewayError,
    _build_connect_params,
    _build_control_ui_origin,
    openclaw_call,
)


def test_build_connect_params_defaults_to_device_pairing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    expected_device_payload = {
        "id": "device-id",
        "publicKey": "public-key",
        "signature": "signature",
        "signedAt": 1,
    }

    def _fake_build_device_connect_payload(
        *,
        client_id: str,
        client_mode: str,
        role: str,
        scopes: list[str],
        auth_token: str | None,
        connect_nonce: str | None,
    ) -> dict[str, object]:
        captured["client_id"] = client_id
        captured["client_mode"] = client_mode
        captured["role"] = role
        captured["scopes"] = scopes
        captured["auth_token"] = auth_token
        captured["connect_nonce"] = connect_nonce
        return expected_device_payload

    monkeypatch.setattr(
        gateway_rpc,
        "_build_device_connect_payload",
        _fake_build_device_connect_payload,
    )

    params = _build_connect_params(GatewayConfig(url="ws://gateway.example/ws"))

    assert params["role"] == "operator"
    assert params["scopes"] == list(GATEWAY_OPERATOR_SCOPES)
    assert params["client"]["id"] == DEFAULT_GATEWAY_CLIENT_ID
    assert params["client"]["mode"] == DEFAULT_GATEWAY_CLIENT_MODE
    assert params["device"] == expected_device_payload
    assert "auth" not in params
    assert captured["client_id"] == DEFAULT_GATEWAY_CLIENT_ID
    assert captured["client_mode"] == DEFAULT_GATEWAY_CLIENT_MODE
    assert captured["role"] == "operator"
    assert captured["scopes"] == list(GATEWAY_OPERATOR_SCOPES)
    assert captured["auth_token"] is None
    assert captured["connect_nonce"] is None


def test_build_connect_params_uses_control_ui_when_pairing_disabled() -> None:
    params = _build_connect_params(
        GatewayConfig(
            url="ws://gateway.example/ws",
            token="secret-token",
            disable_device_pairing=True,
        ),
    )

    assert params["auth"] == {"token": "secret-token"}
    assert params["scopes"] == list(GATEWAY_OPERATOR_SCOPES)
    assert params["client"]["id"] == CONTROL_UI_CLIENT_ID
    assert params["client"]["mode"] == CONTROL_UI_CLIENT_MODE
    assert "device" not in params


def test_build_connect_params_passes_nonce_to_device_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def _fake_build_device_connect_payload(
        *,
        client_id: str,
        client_mode: str,
        role: str,
        scopes: list[str],
        auth_token: str | None,
        connect_nonce: str | None,
    ) -> dict[str, object]:
        captured["client_id"] = client_id
        captured["client_mode"] = client_mode
        captured["role"] = role
        captured["scopes"] = scopes
        captured["auth_token"] = auth_token
        captured["connect_nonce"] = connect_nonce
        return {"id": "device-id", "nonce": connect_nonce}

    monkeypatch.setattr(
        gateway_rpc,
        "_build_device_connect_payload",
        _fake_build_device_connect_payload,
    )

    params = _build_connect_params(
        GatewayConfig(url="ws://gateway.example/ws", token="secret-token"),
        connect_nonce="nonce-xyz",
    )

    assert params["auth"] == {"token": "secret-token"}
    assert params["client"]["id"] == DEFAULT_GATEWAY_CLIENT_ID
    assert params["client"]["mode"] == DEFAULT_GATEWAY_CLIENT_MODE
    assert params["device"] == {"id": "device-id", "nonce": "nonce-xyz"}
    assert captured["client_id"] == DEFAULT_GATEWAY_CLIENT_ID
    assert captured["client_mode"] == DEFAULT_GATEWAY_CLIENT_MODE
    assert captured["role"] == "operator"
    assert captured["scopes"] == list(GATEWAY_OPERATOR_SCOPES)
    assert captured["auth_token"] == "secret-token"
    assert captured["connect_nonce"] == "nonce-xyz"


@pytest.mark.parametrize(
    ("gateway_url", "expected_origin"),
    [
        ("ws://gateway.example/ws", "http://gateway.example"),
        ("wss://gateway.example/ws", "https://gateway.example"),
        ("ws://gateway.example:8080/ws", "http://gateway.example:8080"),
        ("wss://gateway.example:8443/ws", "https://gateway.example:8443"),
        ("ws://[::1]:8000/ws", "http://[::1]:8000"),
    ],
)
def test_build_control_ui_origin(gateway_url: str, expected_origin: str) -> None:
    assert _build_control_ui_origin(gateway_url) == expected_origin


@pytest.mark.asyncio
async def test_openclaw_call_uses_single_connect_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_count = 0

    async def _fake_call_once(
        method: str,
        params: dict[str, object] | None,
        *,
        config: GatewayConfig,
        gateway_url: str,
    ) -> object:
        nonlocal call_count
        del method, params, config, gateway_url
        call_count += 1
        return {"ok": True}

    monkeypatch.setattr(gateway_rpc, "_openclaw_call_once", _fake_call_once)

    payload = await openclaw_call(
        "status",
        config=GatewayConfig(url="ws://gateway.example/ws"),
    )

    assert payload == {"ok": True}
    assert call_count == 1


@pytest.mark.asyncio
async def test_openclaw_call_surfaces_scope_error_without_device_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_call_once(
        method: str,
        params: dict[str, object] | None,
        *,
        config: GatewayConfig,
        gateway_url: str,
    ) -> object:
        del method, params, config, gateway_url
        raise OpenClawGatewayError("missing scope: operator.read")

    monkeypatch.setattr(gateway_rpc, "_openclaw_call_once", _fake_call_once)

    with pytest.raises(OpenClawGatewayError, match="missing scope: operator.read"):
        await openclaw_call(
            "status",
            config=GatewayConfig(url="ws://gateway.example/ws", token="secret-token"),
        )
