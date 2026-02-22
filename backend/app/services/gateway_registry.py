"""Gateway auto-registration, heartbeat processing, and health monitoring."""

from __future__ import annotations

import hashlib
import secrets
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException, status
from sqlmodel import select

from app.core.config import settings
from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.gateways import Gateway

if TYPE_CHECKING:
    from uuid import UUID

    from sqlmodel.ext.asyncio.session import AsyncSession

logger = get_logger(__name__)


def _hash_token(token: str) -> str:
    """SHA-256 hash a registration or relay token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_relay_token() -> str:
    """Generate a cryptographically secure relay token."""
    return secrets.token_urlsafe(48)


async def register_gateway(
    session: AsyncSession,
    *,
    organization_id: UUID,
    registration_token: str,
    name: str,
    url: str,
    workspace_root: str,
    version: str | None = None,
    capabilities: list[str] | None = None,
) -> tuple[Gateway, str]:
    """Register a gateway or re-register an existing one.

    Returns the gateway and the raw relay token (not hashed).
    Raises HTTP 401 if the registration token is invalid.
    Raises HTTP 409 if a gateway with the same name already exists in the org.
    """
    # Look for an existing gateway with a matching registration token
    token_hash = _hash_token(registration_token)
    result = await session.exec(
        select(Gateway).where(
            Gateway.organization_id == organization_id,
            Gateway.registration_token_hash == token_hash,
        )
    )
    existing = result.first()

    if existing is not None:
        # Re-registration: update fields and issue new relay token
        relay_token = generate_relay_token()
        existing.name = name
        existing.url = url
        existing.workspace_root = workspace_root
        existing.status = "online"
        existing.last_heartbeat_at = utcnow()
        existing.connection_info = _build_connection_info(
            version=version, capabilities=capabilities
        )
        existing.token = _hash_token(relay_token)
        existing.updated_at = utcnow()
        session.add(existing)
        await session.commit()
        await session.refresh(existing)
        logger.info(
            "gateway_registry.re_register gateway_id=%s name=%s",
            existing.id,
            name,
        )
        return existing, relay_token

    # Check for name collision within organization
    name_check = await session.exec(
        select(Gateway).where(
            Gateway.organization_id == organization_id,
            Gateway.name == name,
        )
    )
    if name_check.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A gateway with this name already exists in the organization.",
        )

    # New registration
    relay_token = generate_relay_token()
    gateway = Gateway(
        organization_id=organization_id,
        name=name,
        url=url,
        workspace_root=workspace_root,
        registration_token_hash=token_hash,
        token=_hash_token(relay_token),
        status="online",
        last_heartbeat_at=utcnow(),
        connection_info=_build_connection_info(
            version=version, capabilities=capabilities
        ),
        auto_registered=True,
    )
    session.add(gateway)
    await session.commit()
    await session.refresh(gateway)
    logger.info(
        "gateway_registry.register gateway_id=%s name=%s org=%s",
        gateway.id,
        name,
        organization_id,
    )
    return gateway, relay_token


async def process_heartbeat(
    session: AsyncSession,
    *,
    gateway_id: UUID,
    relay_token: str,
    heartbeat_status: str = "online",
    metrics: dict[str, Any] | None = None,
) -> Gateway:
    """Process a heartbeat from a gateway.

    Raises HTTP 401 if the relay token is invalid.
    Raises HTTP 404 if the gateway does not exist.
    """
    gateway = await session.get(Gateway, gateway_id)
    if gateway is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    if gateway.token != _hash_token(relay_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    gateway.status = heartbeat_status
    gateway.last_heartbeat_at = utcnow()
    if metrics is not None:
        info = gateway.connection_info or {}
        info["metrics"] = metrics
        gateway.connection_info = info
    gateway.updated_at = utcnow()
    session.add(gateway)
    await session.commit()
    await session.refresh(gateway)
    logger.debug(
        "gateway_registry.heartbeat gateway_id=%s status=%s",
        gateway_id,
        heartbeat_status,
    )
    return gateway


async def deregister_gateway(
    session: AsyncSession,
    *,
    gateway_id: UUID,
    relay_token: str,
) -> bool:
    """Mark a gateway as offline during graceful shutdown.

    Returns True if deregistered, raises HTTP 401/404 on invalid input.
    """
    gateway = await session.get(Gateway, gateway_id)
    if gateway is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    if gateway.token != _hash_token(relay_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    gateway.status = "offline"
    gateway.updated_at = utcnow()
    session.add(gateway)
    await session.commit()
    logger.info("gateway_registry.deregister gateway_id=%s", gateway_id)
    return True


async def mark_stale_gateways_offline(session: AsyncSession) -> int:
    """Mark gateways that missed heartbeats as offline.

    Called periodically (e.g., every 60s) to detect stale gateways.
    Returns the number of gateways marked offline.
    """
    threshold_seconds = settings.gateway_offline_threshold_seconds
    cutoff = utcnow()
    # Compute cutoff manually since utcnow() returns naive datetime
    from datetime import timedelta

    cutoff = cutoff - timedelta(seconds=threshold_seconds)

    result = await session.exec(
        select(Gateway).where(
            Gateway.status == "online",
            Gateway.last_heartbeat_at is not None,
            Gateway.last_heartbeat_at < cutoff,  # type: ignore[operator]
        )
    )
    stale = result.all()
    count = 0
    for gw in stale:
        gw.status = "offline"
        gw.updated_at = utcnow()
        session.add(gw)
        count += 1
    if count > 0:
        await session.commit()
        logger.info("gateway_registry.mark_stale count=%d", count)
    return count


def _build_connection_info(
    *,
    version: str | None = None,
    capabilities: list[str] | None = None,
) -> dict[str, Any]:
    """Build the JSONB connection_info payload."""
    info: dict[str, Any] = {}
    if version is not None:
        info["version"] = version
    if capabilities is not None:
        info["capabilities"] = capabilities
    return info
