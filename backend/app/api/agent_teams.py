"""Agent team management API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import require_org_admin
from app.db.session import get_session
from app.schemas.agent_teams import (
    AgentCapabilityCreate,
    AgentCapabilityRead,
    AgentTeamCreate,
    AgentTeamMemberCreate,
    AgentTeamMemberRead,
    AgentTeamRead,
    AgentTeamUpdate,
    CapabilitySearchResponse,
)
from app.schemas.common import OkResponse
from app.services.organizations import OrganizationContext
from app.services.team_service import TeamService

router = APIRouter(prefix="/agent-teams", tags=["agent-teams"])
capabilities_router = APIRouter(prefix="/agents", tags=["agent-teams"])

SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)


@router.get("", response_model=list[AgentTeamRead])
async def list_teams(
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> list[AgentTeamRead]:
    """List all agent teams for the organization."""
    service = TeamService(session)
    return await service.list_teams(organization_id=ctx.member.organization_id)


@router.post("", response_model=AgentTeamRead)
async def create_team(
    payload: AgentTeamCreate,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> AgentTeamRead:
    """Create a new agent team."""
    service = TeamService(session)
    return await service.create_team(payload, organization_id=ctx.member.organization_id)


@router.get("/{team_id}", response_model=AgentTeamRead)
async def get_team(
    team_id: UUID,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> AgentTeamRead:
    """Get a single agent team by id."""
    service = TeamService(session)
    return await service.get_team(team_id, organization_id=ctx.member.organization_id)


@router.patch("/{team_id}", response_model=AgentTeamRead)
async def update_team(
    team_id: UUID,
    payload: AgentTeamUpdate,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> AgentTeamRead:
    """Update an agent team."""
    service = TeamService(session)
    return await service.update_team(team_id, payload, organization_id=ctx.member.organization_id)


@router.delete("/{team_id}", response_model=OkResponse)
async def delete_team(
    team_id: UUID,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> OkResponse:
    """Delete an agent team."""
    service = TeamService(session)
    await service.delete_team(team_id, organization_id=ctx.member.organization_id)
    return OkResponse(ok=True)


@router.get("/{team_id}/members", response_model=list[AgentTeamMemberRead])
async def list_members(
    team_id: UUID,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> list[AgentTeamMemberRead]:
    """List all members of a team."""
    service = TeamService(session)
    return await service.list_members(team_id, organization_id=ctx.member.organization_id)


@router.post("/{team_id}/members", response_model=AgentTeamMemberRead)
async def add_member(
    team_id: UUID,
    payload: AgentTeamMemberCreate,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> AgentTeamMemberRead:
    """Add an agent to a team."""
    service = TeamService(session)
    return await service.add_member(team_id, payload, organization_id=ctx.member.organization_id)


@router.delete("/{team_id}/members/{agent_id}", response_model=OkResponse)
async def remove_member(
    team_id: UUID,
    agent_id: UUID,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> OkResponse:
    """Remove an agent from a team."""
    service = TeamService(session)
    await service.remove_member(team_id, agent_id, organization_id=ctx.member.organization_id)
    return OkResponse(ok=True)


# --- Agent capability endpoints ---

@capabilities_router.get("/{agent_id}/capabilities", response_model=list[AgentCapabilityRead])
async def list_capabilities(
    agent_id: UUID,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> list[AgentCapabilityRead]:
    """List all capabilities for an agent."""
    service = TeamService(session)
    return await service.list_capabilities(agent_id)


@capabilities_router.post("/{agent_id}/capabilities", response_model=AgentCapabilityRead)
async def add_capability(
    agent_id: UUID,
    payload: AgentCapabilityCreate,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> AgentCapabilityRead:
    """Add a capability to an agent."""
    service = TeamService(session)
    return await service.add_capability(
        agent_id, payload, organization_id=ctx.member.organization_id
    )


@capabilities_router.delete(
    "/{agent_id}/capabilities/{capability}", response_model=OkResponse
)
async def remove_capability(
    agent_id: UUID,
    capability: str,
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> OkResponse:
    """Remove a capability from an agent."""
    service = TeamService(session)
    await service.remove_capability(agent_id, capability)
    return OkResponse(ok=True)


# Search endpoint using a separate router prefix
search_router = APIRouter(prefix="/agent-capabilities", tags=["agent-teams"])


@search_router.get("/search", response_model=CapabilitySearchResponse)
async def search_by_capabilities(
    capabilities: list[str] = Query(default=[]),
    session=SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> CapabilitySearchResponse:
    """Find agents matching the requested capabilities."""
    service = TeamService(session)
    return await service.search_by_capabilities(
        capabilities, organization_id=ctx.member.organization_id
    )
