"""DB-backed gateway config resolution and message dispatch helpers.

This module exists to keep `app.api.*` thin: APIs should call OpenClaw services, not
directly orchestrate gateway RPC calls.
"""

from __future__ import annotations

from uuid import uuid4

from app.models.boards import Board
from app.models.gateways import Gateway
from app.services.openclaw.db_service import OpenClawDBService
from app.services.openclaw.gateway_resolver import (
    gateway_client_config,
    get_gateway_for_board,
    optional_gateway_client_config,
    require_gateway_for_board,
)
from app.services.openclaw.gateway_rpc import GatewayConfig as GatewayClientConfig
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, send_message


class GatewayDispatchService(OpenClawDBService):
    """Resolve gateway config for boards and dispatch messages to agent sessions."""

    async def optional_gateway_config_for_board(
        self,
        board: Board,
    ) -> GatewayClientConfig | None:
        gateway = await get_gateway_for_board(self.session, board)
        return optional_gateway_client_config(gateway)

    async def require_gateway_config_for_board(
        self,
        board: Board,
    ) -> tuple[Gateway, GatewayClientConfig]:
        gateway = await require_gateway_for_board(self.session, board)
        return gateway, gateway_client_config(gateway)

    async def send_agent_message(
        self,
        *,
        session_key: str,
        config: GatewayClientConfig,
        agent_name: str,
        message: str,
        deliver: bool = False,
    ) -> None:
        # NOTE: ensure_session (sessions.patch) was removed from this path.
        # It updated the session label but blocked for up to 20s when the target
        # session was mid-processing (e.g. running an LLM call), causing MC's
        # 10-second WS timeout to fire and silently drop the notification.
        # The session always exists after provisioning; no pre-flight patch needed.
        await send_message(message, session_key=session_key, config=config, deliver=deliver)

    async def try_send_agent_message(
        self,
        *,
        session_key: str,
        config: GatewayClientConfig,
        agent_name: str,
        message: str,
        deliver: bool = False,
        throttle_key: str | None = None,
        min_interval_seconds: float | None = None,
    ) -> OpenClawGatewayError | None:
        # Coalesce bursty agent-originated notifications so a single recipient
        # session is not interrupted more than once per window. Fail-open: any
        # Redis error must never drop a real message.
        if throttle_key and min_interval_seconds and min_interval_seconds > 0:
            try:
                from app.core.config import settings as _settings
                from app.core.rate_limit import _get_async_redis

                # rq_redis_url is always configured (RQ_REDIS_URL); rate_limit_redis_url
                # is only populated when RATE_LIMIT_BACKEND=redis, so use the RQ URL.
                redis = _get_async_redis(_settings.rq_redis_url)
                allowed = await redis.set(
                    f"notify-throttle:{throttle_key}",
                    "1",
                    nx=True,
                    ex=int(min_interval_seconds),
                )
                if not allowed:
                    return None
            except Exception:  # noqa: BLE001 - never block delivery on cache errors
                pass
        try:
            await self.send_agent_message(
                session_key=session_key,
                config=config,
                agent_name=agent_name,
                message=message,
                deliver=deliver,
            )
        except OpenClawGatewayError as exc:
            return exc
        return None

    @staticmethod
    def resolve_trace_id(correlation_id: str | None, *, prefix: str) -> str:
        normalized = (correlation_id or "").strip()
        if normalized:
            return normalized
        return f"{prefix}:{uuid4().hex[:12]}"
