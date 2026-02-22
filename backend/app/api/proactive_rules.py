"""Proactive rule management endpoints: CRUD and toggle."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import col, select

from app.api.deps import SESSION_DEP, require_admin_auth
from app.core.time import utcnow
from app.db.pagination import paginate
from app.models.proactive_rules import ProactiveRule
from app.schemas.common import OkResponse
from app.schemas.pagination import DefaultLimitOffsetPage
from app.schemas.proactive_rules import (
    ProactiveRuleCreate,
    ProactiveRuleRead,
    ProactiveRuleUpdate,
)
from app.services.organizations import get_active_membership

if TYPE_CHECKING:
    from fastapi_pagination.limit_offset import LimitOffsetPage
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.core.auth import AuthContext

router = APIRouter(prefix="/proactive-rules", tags=["proactive-rules"])

ADMIN_AUTH_DEP = Depends(require_admin_auth)


@router.get("", response_model=DefaultLimitOffsetPage[ProactiveRuleRead])
async def list_proactive_rules(
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> LimitOffsetPage[ProactiveRuleRead]:
    """List proactive rules for the caller's organization."""
    org_id = await _resolve_org_id(session, auth)
    statement = (
        select(ProactiveRule)
        .where(col(ProactiveRule.organization_id) == org_id)
        .order_by(col(ProactiveRule.created_at).asc())
    )
    return await paginate(session, statement)


@router.post("", response_model=ProactiveRuleRead, status_code=status.HTTP_201_CREATED)
async def create_proactive_rule(
    payload: ProactiveRuleCreate,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> ProactiveRuleRead:
    """Create a new proactive rule."""
    org_id = await _resolve_org_id(session, auth)
    rule = ProactiveRule(
        organization_id=org_id,
        board_id=payload.board_id,
        name=payload.name,
        description=payload.description,
        trigger_event=payload.trigger_event,
        conditions=payload.conditions,
        action_type=payload.action_type,
        action_config=payload.action_config,
        cooldown_seconds=payload.cooldown_seconds,
        is_enabled=True,
        is_builtin=False,
    )
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return ProactiveRuleRead.model_validate(rule, from_attributes=True)


@router.patch("/{rule_id}", response_model=ProactiveRuleRead)
async def update_proactive_rule(
    rule_id: UUID,
    payload: ProactiveRuleUpdate,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> ProactiveRuleRead:
    """Partially update a proactive rule."""
    org_id = await _resolve_org_id(session, auth)
    rule = await _load_rule_or_404(session, rule_id, org_id)
    if payload.name is not None:
        rule.name = payload.name
    if payload.description is not None:
        rule.description = payload.description
    if payload.conditions is not None:
        rule.conditions = payload.conditions
    if payload.action_config is not None:
        rule.action_config = payload.action_config
    if payload.cooldown_seconds is not None:
        rule.cooldown_seconds = payload.cooldown_seconds
    rule.updated_at = utcnow()
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return ProactiveRuleRead.model_validate(rule, from_attributes=True)


@router.delete("/{rule_id}", response_model=OkResponse)
async def delete_proactive_rule(
    rule_id: UUID,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> OkResponse:
    """Delete a proactive rule (builtin rules cannot be deleted)."""
    org_id = await _resolve_org_id(session, auth)
    rule = await _load_rule_or_404(session, rule_id, org_id)
    if rule.is_builtin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Builtin rules cannot be deleted. Use the toggle endpoint to disable them.",
        )
    await session.delete(rule)
    await session.commit()
    return OkResponse()


@router.post("/{rule_id}/toggle", response_model=ProactiveRuleRead)
async def toggle_proactive_rule(
    rule_id: UUID,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = ADMIN_AUTH_DEP,
) -> ProactiveRuleRead:
    """Toggle the enabled/disabled state of a proactive rule."""
    org_id = await _resolve_org_id(session, auth)
    rule = await _load_rule_or_404(session, rule_id, org_id)
    rule.is_enabled = not rule.is_enabled
    rule.updated_at = utcnow()
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return ProactiveRuleRead.model_validate(rule, from_attributes=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_org_id(session: AsyncSession, auth: AuthContext) -> UUID:
    if auth.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    member = await get_active_membership(session, auth.user)
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return member.organization_id


async def _load_rule_or_404(
    session: AsyncSession,
    rule_id: UUID,
    org_id: UUID,
) -> ProactiveRule:
    rule = await session.get(ProactiveRule, rule_id)
    if rule is None or rule.organization_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return rule
