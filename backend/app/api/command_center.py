"""Command Center dashboard aggregation API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import require_org_admin
from app.db.session import get_session
from app.schemas.command_center import (
    AgentStatusResponse,
    CommandCenterOverview,
    CommunicationGraphResponse,
    LiveActivityResponse,
    ResourceAllocationResponse,
)
from app.services.command_center_service import CommandCenterService
from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/command-center", tags=["command-center"])

SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)


@router.get("/overview", response_model=CommandCenterOverview)
async def get_overview(
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> CommandCenterOverview:
    """Get high-level KPI snapshot for the Command Center."""
    service = CommandCenterService(session)
    return await service.get_overview(organization_id=ctx.member.organization_id)


@router.get("/agent-status", response_model=AgentStatusResponse)
async def get_agent_status(
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> AgentStatusResponse:
    """Get live status for all agents."""
    service = CommandCenterService(session)
    return await service.get_agent_status()


@router.get("/communication-graph", response_model=CommunicationGraphResponse)
async def get_communication_graph(
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> CommunicationGraphResponse:
    """Get agent communication graph derived from recent events."""
    service = CommandCenterService(session)
    return await service.get_communication_graph(organization_id=ctx.member.organization_id)


@router.get("/resource-allocation", response_model=ResourceAllocationResponse)
async def get_resource_allocation(
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> ResourceAllocationResponse:
    """Get per-agent resource allocation and task distribution."""
    service = CommandCenterService(session)
    return await service.get_resource_allocation()


@router.get("/live-activity", response_model=LiveActivityResponse)
async def get_live_activity(
    limit: int = Query(default=50, ge=1, le=200),
    since_id: UUID | None = Query(default=None),
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> LiveActivityResponse:
    """Fetch recent agent events for the live activity stream."""
    service = CommandCenterService(session)
    return await service.get_live_activity(
        organization_id=ctx.member.organization_id,
        limit=limit,
        since_id=since_id,
    )
