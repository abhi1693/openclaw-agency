"""System-level monitoring endpoints (hardware telemetry, cron jobs, etc.)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_org_member
from app.db.session import get_session
from app.models.gateways import Gateway
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, openclaw_call
from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/system", tags=["system"])

SESSION_DEP = Depends(get_session)
ORG_MEMBER_DEP = Depends(require_org_member)


async def _first_gateway(session: AsyncSession, organization_id: Any) -> Gateway | None:
    result = await session.exec(
        select(Gateway)
        .where(col(Gateway.organization_id) == organization_id)
        .limit(1)
    )
    return result.first()


@router.get("/cron-jobs")
async def get_cron_jobs(
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
) -> JSONResponse:
    """Return the list of cron jobs from the organization's first gateway."""
    gateway = await _first_gateway(session, ctx.organization.id)
    if gateway is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Gateway 不可用", "jobs": []},
        )
    try:
        config = gateway_client_config(gateway)
        result = await openclaw_call("cron.list", {}, config=config)
        return JSONResponse(content={"jobs": result})
    except (OpenClawGatewayError, Exception):
        return JSONResponse(
            status_code=503,
            content={"error": "Gateway 不可用", "jobs": []},
        )


class _CronJobUpdateBody:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled


@router.patch("/cron-jobs/{job_id}")
async def update_cron_job(
    job_id: str,
    body: dict,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
) -> JSONResponse:
    """Enable or disable a cron job (Phase 2 skeleton)."""
    enabled = body.get("enabled", True)
    gateway = await _first_gateway(session, ctx.organization.id)
    if gateway is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Gateway 不可用"},
        )
    try:
        config = gateway_client_config(gateway)
        await openclaw_call(
            "cron.update",
            {"id": job_id, "enabled": enabled},
            config=config,
        )
        return JSONResponse(content={"ok": True})
    except (OpenClawGatewayError, Exception):
        return JSONResponse(
            status_code=503,
            content={"error": "Gateway 不可用"},
        )
