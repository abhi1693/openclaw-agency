# ruff: noqa: S101
from __future__ import annotations

from uuid import uuid4

import pytest

from app.models.gateways import Gateway
from app.schemas.gateway_api import GatewayResolveQuery
from app.services.openclaw.gateway_resolver import (
    gateway_client_config,
    optional_gateway_client_config,
)
from app.services.openclaw.session_service import GatewaySessionService


def _gateway(
    *,
    disable_device_pairing: bool,
    allow_insecure_tls: bool = False,
    url: str = "ws://gateway.example:18789/ws",
    token: str | None = " secret-token ",
) -> Gateway:
    return Gateway(
        id=uuid4(),
        organization_id=uuid4(),
        name="Primary gateway",
        url=url,
        token=token,
        workspace_root="~/.openclaw",
        disable_device_pairing=disable_device_pairing,
        allow_insecure_tls=allow_insecure_tls,
    )


def test_gateway_client_config_maps_disable_device_pairing() -> None:
    config = gateway_client_config(_gateway(disable_device_pairing=True))

    assert config.url == "ws://gateway.example:18789/ws"
    assert config.token == "secret-token"
    assert config.disable_device_pairing is True


def test_optional_gateway_client_config_maps_disable_device_pairing() -> None:
    config = optional_gateway_client_config(_gateway(disable_device_pairing=False))

    assert config is not None
    assert config.disable_device_pairing is False


def test_gateway_client_config_maps_allow_insecure_tls() -> None:
    config = gateway_client_config(
        _gateway(disable_device_pairing=False, allow_insecure_tls=True),
    )

    assert config.allow_insecure_tls is True


def test_optional_gateway_client_config_returns_none_for_missing_or_blank_url() -> None:
    assert optional_gateway_client_config(None) is None
    assert (
        optional_gateway_client_config(
            _gateway(disable_device_pairing=False, url="   "),
        )
        is None
    )


def test_to_resolve_query_keeps_gateway_disable_device_pairing_value() -> None:
    resolved = GatewaySessionService.to_resolve_query(
        board_id=None,
        gateway_url="ws://gateway.example:18789/ws",
        gateway_token="secret-token",
        gateway_disable_device_pairing=True,
    )

    assert resolved.gateway_disable_device_pairing is True


def test_to_resolve_query_keeps_gateway_allow_insecure_tls_value() -> None:
    resolved = GatewaySessionService.to_resolve_query(
        board_id=None,
        gateway_url="wss://gateway.example:18789/ws",
        gateway_token="secret-token",
        gateway_allow_insecure_tls=True,
    )

    assert resolved.gateway_allow_insecure_tls is True


@pytest.mark.asyncio
async def test_resolve_gateway_keeps_gateway_allow_insecure_tls_for_direct_url() -> None:
    service = GatewaySessionService(session=object())  # type: ignore[arg-type]
    _, config, _ = await service.resolve_gateway(
        GatewayResolveQuery(
            gateway_url="wss://gateway.example:18789/ws",
            gateway_allow_insecure_tls=True,
        ),
        user=None,
    )

    assert config.allow_insecure_tls is True
