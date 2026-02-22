"""Business logic for H5 user registration, authentication, and agent assignments."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import select

from app.core.h5_auth import (
    create_h5_access_token,
    create_h5_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.core.time import utcnow
from app.models.h5_users import H5RefreshToken, H5User, H5UserAgentAssignment

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings


async def register_h5_user(
    session: AsyncSession,
    *,
    organization_id: UUID,
    username: str,
    password: str,
    display_name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
) -> H5User:
    """Register a new H5 user. Raises HTTP 409 if username already taken."""
    existing = await session.exec(
        select(H5User).where(
            H5User.organization_id == organization_id,
            H5User.username == username,
        )
    )
    if existing.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken in this organization.",
        )

    user = H5User(
        organization_id=organization_id,
        username=username,
        password_hash=hash_password(password),
        display_name=display_name,
        email=email,
        phone=phone,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def authenticate_h5_user(
    session: AsyncSession,
    *,
    organization_id: UUID,
    username: str,
    password: str,
) -> H5User | None:
    """Authenticate an H5 user by org+username+password. Returns user or None."""
    result = await session.exec(
        select(H5User).where(
            H5User.organization_id == organization_id,
            H5User.username == username,
            H5User.status == "active",
        )
    )
    user = result.first()
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None

    user.last_login_at = utcnow()
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def create_tokens(
    session: AsyncSession,
    h5_user: H5User,
) -> tuple[str, str]:
    """Create a new access+refresh token pair, storing the refresh hash in DB."""
    access_token = create_h5_access_token(h5_user.id, h5_user.organization_id)
    raw_refresh = create_h5_refresh_token()
    refresh_record = H5RefreshToken(
        h5_user_id=h5_user.id,
        token_hash=hash_refresh_token(raw_refresh),
        expires_at=utcnow() + timedelta(days=settings.h5_jwt_refresh_ttl_days),
    )
    session.add(refresh_record)
    await session.commit()
    return access_token, raw_refresh


async def refresh_tokens(
    session: AsyncSession,
    raw_refresh_token: str,
) -> tuple[str, str] | None:
    """Validate a refresh token, rotate it, and return a new token pair.

    Old-token revocation and new-token creation are performed within a
    single database transaction to prevent token reuse on partial failures.

    Returns None if the refresh token is invalid, revoked, or expired.
    """
    token_hash = hash_refresh_token(raw_refresh_token)
    result = await session.exec(
        select(H5RefreshToken).where(
            H5RefreshToken.token_hash == token_hash,
            H5RefreshToken.revoked == False,  # noqa: E712
        )
    )
    record = result.first()
    if record is None:
        return None
    if record.expires_at < utcnow():
        record.revoked = True
        session.add(record)
        await session.commit()
        return None

    # Load user before opening the rotation transaction so we can bail
    # early without holding the write lock longer than necessary.
    user = await session.get(H5User, record.h5_user_id)
    if user is None or user.status != "active":
        return None

    # Perform revocation of the old token and creation of the new token
    # inside a single atomic transaction to prevent token reuse on failure.
    async with session.begin_nested():
        record.revoked = True
        session.add(record)

        access_token = create_h5_access_token(user.id, user.organization_id)
        raw_refresh = create_h5_refresh_token()
        new_record = H5RefreshToken(
            h5_user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh),
            expires_at=utcnow() + timedelta(days=settings.h5_jwt_refresh_ttl_days),
        )
        session.add(new_record)

    await session.commit()
    return access_token, raw_refresh


async def get_user_assignments(
    session: AsyncSession,
    h5_user_id: UUID,
) -> list[H5UserAgentAssignment]:
    """List all agent assignments for an H5 user."""
    result = await session.exec(
        select(H5UserAgentAssignment).where(
            H5UserAgentAssignment.h5_user_id == h5_user_id,
        )
    )
    return list(result.all())


async def assign_user_to_agent(
    session: AsyncSession,
    *,
    h5_user_id: UUID,
    agent_id: UUID,
    board_id: UUID,
    assigned_by: UUID | None = None,
    role: str = "user",
) -> H5UserAgentAssignment:
    """Assign an H5 user to an agent. Raises HTTP 409 if already assigned."""
    existing = await session.exec(
        select(H5UserAgentAssignment).where(
            H5UserAgentAssignment.h5_user_id == h5_user_id,
            H5UserAgentAssignment.agent_id == agent_id,
        )
    )
    if existing.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already assigned to this agent.",
        )

    assignment = H5UserAgentAssignment(
        h5_user_id=h5_user_id,
        agent_id=agent_id,
        board_id=board_id,
        assigned_by=assigned_by,
        role=role,
    )
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    return assignment


async def unassign_user_from_agent(
    session: AsyncSession,
    *,
    h5_user_id: UUID,
    agent_id: UUID,
) -> bool:
    """Remove an H5 user's assignment to an agent. Returns True if deleted."""
    result = await session.exec(
        select(H5UserAgentAssignment).where(
            H5UserAgentAssignment.h5_user_id == h5_user_id,
            H5UserAgentAssignment.agent_id == agent_id,
        )
    )
    assignment = result.first()
    if assignment is None:
        return False
    await session.delete(assignment)
    await session.commit()
    return True
