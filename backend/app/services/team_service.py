"""Team formation and member management service."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import col, select

from app.core.time import utcnow
from app.models.agent_capabilities import AgentCapability
from app.models.agent_teams import AgentTeam, AgentTeamMember
from app.models.agents import Agent
from app.schemas.agent_teams import (
    AgentCapabilityCreate,
    AgentCapabilityRead,
    AgentTeamCreate,
    AgentTeamMemberCreate,
    AgentTeamMemberRead,
    AgentTeamRead,
    AgentTeamUpdate,
    CapabilitySearchResponse,
    CapabilitySearchResult,
)

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession


class TeamService:
    """Service for agent team CRUD and member management."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_teams(self, organization_id: UUID) -> list[AgentTeamRead]:
        """List all teams for an organization."""
        statement = select(AgentTeam).where(
            col(AgentTeam.organization_id) == organization_id
        )
        teams = list((await self._session.exec(statement)).all())
        result: list[AgentTeamRead] = []
        for team in teams:
            count = await self._member_count(team.id)
            result.append(self._team_to_read(team, member_count=count))
        return result

    async def get_team(self, team_id: UUID, organization_id: UUID) -> AgentTeamRead:
        """Get a single team by id."""
        team = await self._get_team_or_404(team_id, organization_id)
        count = await self._member_count(team.id)
        return self._team_to_read(team, member_count=count)

    async def create_team(
        self, payload: AgentTeamCreate, organization_id: UUID
    ) -> AgentTeamRead:
        """Create a new agent team."""
        team = AgentTeam(
            organization_id=organization_id,
            board_id=payload.board_id,
            name=payload.name,
            description=payload.description,
            team_type=payload.team_type,
            config=payload.config,
        )
        self._session.add(team)
        await self._session.commit()
        await self._session.refresh(team)
        return self._team_to_read(team, member_count=0)

    async def update_team(
        self,
        team_id: UUID,
        payload: AgentTeamUpdate,
        organization_id: UUID,
    ) -> AgentTeamRead:
        """Update an existing agent team."""
        team = await self._get_team_or_404(team_id, organization_id)
        update_data = payload.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(team, field, value)
        team.updated_at = utcnow()
        self._session.add(team)
        await self._session.commit()
        await self._session.refresh(team)
        count = await self._member_count(team.id)
        return self._team_to_read(team, member_count=count)

    async def delete_team(self, team_id: UUID, organization_id: UUID) -> None:
        """Delete a team and all its members."""
        team = await self._get_team_or_404(team_id, organization_id)
        # Delete members first
        members_stmt = select(AgentTeamMember).where(col(AgentTeamMember.team_id) == team.id)
        members = list((await self._session.exec(members_stmt)).all())
        for member in members:
            await self._session.delete(member)
        await self._session.delete(team)
        await self._session.commit()

    async def list_members(
        self, team_id: UUID, organization_id: UUID
    ) -> list[AgentTeamMemberRead]:
        """List all members of a team."""
        await self._get_team_or_404(team_id, organization_id)
        statement = select(AgentTeamMember).where(col(AgentTeamMember.team_id) == team_id)
        members = list((await self._session.exec(statement)).all())
        result: list[AgentTeamMemberRead] = []
        for member in members:
            agent_name = await self._get_agent_name(member.agent_id)
            result.append(self._member_to_read(member, agent_name=agent_name))
        return result

    async def add_member(
        self,
        team_id: UUID,
        payload: AgentTeamMemberCreate,
        organization_id: UUID,
    ) -> AgentTeamMemberRead:
        """Add an agent to a team."""
        await self._get_team_or_404(team_id, organization_id)
        # Verify agent exists
        agent_stmt = select(Agent).where(col(Agent.id) == payload.agent_id)
        agent = (await self._session.exec(agent_stmt)).one_or_none()
        if agent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
        # Check duplicate
        existing_stmt = select(AgentTeamMember).where(
            col(AgentTeamMember.team_id) == team_id,
            col(AgentTeamMember.agent_id) == payload.agent_id,
        )
        existing = (await self._session.exec(existing_stmt)).one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Agent is already a member of this team.",
            )
        member = AgentTeamMember(
            team_id=team_id,
            agent_id=payload.agent_id,
            role_in_team=payload.role_in_team,
            capabilities=payload.capabilities,
        )
        self._session.add(member)
        await self._session.commit()
        await self._session.refresh(member)
        return self._member_to_read(member, agent_name=agent.name)

    async def remove_member(
        self,
        team_id: UUID,
        agent_id: UUID,
        organization_id: UUID,
    ) -> None:
        """Remove an agent from a team."""
        await self._get_team_or_404(team_id, organization_id)
        statement = select(AgentTeamMember).where(
            col(AgentTeamMember.team_id) == team_id,
            col(AgentTeamMember.agent_id) == agent_id,
        )
        member = (await self._session.exec(statement)).one_or_none()
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent is not a member of this team.",
            )
        await self._session.delete(member)
        await self._session.commit()

    # --- Capability management ---

    async def list_capabilities(self, agent_id: UUID) -> list[AgentCapabilityRead]:
        """List all capabilities for an agent."""
        statement = select(AgentCapability).where(col(AgentCapability.agent_id) == agent_id)
        caps = list((await self._session.exec(statement)).all())
        return [self._capability_to_read(cap) for cap in caps]

    async def add_capability(
        self,
        agent_id: UUID,
        payload: AgentCapabilityCreate,
        organization_id: UUID,
    ) -> AgentCapabilityRead:
        """Add a capability to an agent."""
        existing_stmt = select(AgentCapability).where(
            col(AgentCapability.agent_id) == agent_id,
            col(AgentCapability.capability) == payload.capability,
        )
        existing = (await self._session.exec(existing_stmt)).one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Agent already has this capability.",
            )
        cap = AgentCapability(
            organization_id=organization_id,
            agent_id=agent_id,
            capability=payload.capability,
            proficiency=payload.proficiency,
        )
        self._session.add(cap)
        await self._session.commit()
        await self._session.refresh(cap)
        return self._capability_to_read(cap)

    async def remove_capability(
        self,
        agent_id: UUID,
        capability: str,
    ) -> None:
        """Remove a capability from an agent."""
        statement = select(AgentCapability).where(
            col(AgentCapability.agent_id) == agent_id,
            col(AgentCapability.capability) == capability,
        )
        cap = (await self._session.exec(statement)).one_or_none()
        if cap is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Capability not found."
            )
        await self._session.delete(cap)
        await self._session.commit()

    async def search_by_capabilities(
        self,
        capabilities: list[str],
        organization_id: UUID,
    ) -> CapabilitySearchResponse:
        """Find agents matching the requested capabilities."""
        statement = select(AgentCapability).where(
            col(AgentCapability.organization_id) == organization_id,
            col(AgentCapability.capability).in_(capabilities),
        )
        rows = list((await self._session.exec(statement)).all())

        # Group by agent
        by_agent: dict[UUID, list[AgentCapability]] = {}
        for row in rows:
            by_agent.setdefault(row.agent_id, []).append(row)

        results: list[CapabilitySearchResult] = []
        for agent_id, caps in by_agent.items():
            agent_name = await self._get_agent_name(agent_id)
            matched = [cap.capability for cap in caps]
            scores = {cap.capability: cap.proficiency for cap in caps}
            results.append(
                CapabilitySearchResult(
                    agent_id=agent_id,
                    agent_name=agent_name or str(agent_id),
                    matched_capabilities=matched,
                    proficiency_scores=scores,
                )
            )
        # Sort by most matched capabilities
        results.sort(key=lambda r: len(r.matched_capabilities), reverse=True)
        return CapabilitySearchResponse(agents=results)

    # --- Private helpers ---

    async def _get_team_or_404(self, team_id: UUID, organization_id: UUID) -> AgentTeam:
        statement = select(AgentTeam).where(
            col(AgentTeam.id) == team_id,
            col(AgentTeam.organization_id) == organization_id,
        )
        team = (await self._session.exec(statement)).one_or_none()
        if team is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found.")
        return team

    async def _member_count(self, team_id: UUID) -> int:
        from sqlalchemy import func

        statement = select(func.count()).where(col(AgentTeamMember.team_id) == team_id)
        result = (await self._session.exec(statement)).one()
        return int(result)

    async def _get_agent_name(self, agent_id: UUID) -> str | None:
        statement = select(Agent.name).where(col(Agent.id) == agent_id)
        result = (await self._session.exec(statement)).one_or_none()
        if result is None:
            return None
        return str(result)

    @staticmethod
    def _team_to_read(team: AgentTeam, *, member_count: int) -> AgentTeamRead:
        return AgentTeamRead(
            id=team.id,
            organization_id=team.organization_id,
            board_id=team.board_id,
            name=team.name,
            description=team.description,
            team_type=team.team_type,
            config=team.config,
            created_at=team.created_at,
            updated_at=team.updated_at,
            member_count=member_count,
        )

    @staticmethod
    def _member_to_read(member: AgentTeamMember, *, agent_name: str | None) -> AgentTeamMemberRead:
        return AgentTeamMemberRead(
            id=member.id,
            team_id=member.team_id,
            agent_id=member.agent_id,
            role_in_team=member.role_in_team,
            capabilities=member.capabilities,
            agent_name=agent_name,
            joined_at=member.joined_at,
        )

    @staticmethod
    def _capability_to_read(cap: AgentCapability) -> AgentCapabilityRead:
        return AgentCapabilityRead(
            id=cap.id,
            agent_id=cap.agent_id,
            organization_id=cap.organization_id,
            capability=cap.capability,
            proficiency=cap.proficiency,
            metadata=cap.metadata,
            created_at=cap.created_at,
        )
