"""Admin endpoints for managing H5 users and agent assignments."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import col, select

from app.api.deps import SESSION_DEP, require_org_admin
from app.db.pagination import paginate
from app.models.h5_users import H5User, H5UserAgentAssignment
from app.schemas.common import OkResponse
from app.schemas.h5_auth import H5AssignAgentRequest, H5AssignmentRead, H5UserRead
from app.schemas.pagination import DefaultLimitOffsetPage
from app.services.h5_user_service import assign_user_to_agent, unassign_user_from_agent
from app.services.organizations import OrganizationContext

if TYPE_CHECKING:
    from fastapi_pagination.limit_offset import LimitOffsetPage
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/h5/users", tags=["h5-users"])
ORG_ADMIN_DEP = Depends(require_org_admin)


@router.get(
    "",
    response_model=DefaultLimitOffsetPage[H5UserRead],
    summary="List H5 Users",
)
async def list_h5_users(
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> LimitOffsetPage[H5UserRead]:
    """List H5 users in the admin's organization with limit/offset pagination."""
    statement = (
        select(H5User)
        .where(H5User.organization_id == ctx.organization.id)
        .order_by(col(H5User.created_at).desc())
    )
    return await paginate(session, statement)


@router.post(
    "/{h5_user_id}/assign",
    response_model=H5AssignmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Assign H5 User to Agent",
)
async def assign_h5_user(
    h5_user_id: UUID,
    payload: H5AssignAgentRequest,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> H5AssignmentRead:
    """Assign an H5 user to an agent on a board."""
    user = await session.get(H5User, h5_user_id)
    if user is None or user.organization_id != ctx.organization.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    assignment = await assign_user_to_agent(
        session,
        h5_user_id=h5_user_id,
        agent_id=payload.agent_id,
        board_id=payload.board_id,
        assigned_by=ctx.member.user_id,
        role=payload.role,
    )
    return H5AssignmentRead.model_validate(assignment)


@router.delete(
    "/{h5_user_id}/assign/{agent_id}",
    response_model=OkResponse,
    summary="Unassign H5 User from Agent",
)
async def unassign_h5_user(
    h5_user_id: UUID,
    agent_id: UUID,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> OkResponse:
    """Remove an H5 user's assignment to an agent."""
    user = await session.get(H5User, h5_user_id)
    if user is None or user.organization_id != ctx.organization.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    deleted = await unassign_user_from_agent(
        session,
        h5_user_id=h5_user_id,
        agent_id=agent_id,
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return OkResponse()
