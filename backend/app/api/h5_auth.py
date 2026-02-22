"""H5 user authentication endpoints: register, login, refresh, profile."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import H5AuthContext, H5_AUTH_DEP, SESSION_DEP
from app.core.time import utcnow
from app.db import crud
from app.schemas.h5_auth import (
    H5AccessTokenResponse,
    H5AssignmentRead,
    H5LoginRequest,
    H5RefreshRequest,
    H5RegisterRequest,
    H5TokenResponse,
    H5UserMeResponse,
    H5UserRead,
    H5UserUpdate,
)
from app.services.h5_user_service import (
    authenticate_h5_user,
    create_tokens,
    get_user_assignments,
    refresh_tokens,
    register_h5_user,
)

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/h5/auth", tags=["h5-auth"])


@router.post(
    "/register",
    response_model=H5TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register H5 User",
)
async def h5_register(
    payload: H5RegisterRequest,
    session: AsyncSession = SESSION_DEP,
) -> H5TokenResponse:
    """Register a new H5 end user and return auth tokens."""
    user = await register_h5_user(
        session,
        organization_id=payload.organization_id,
        username=payload.username,
        password=payload.password,
        display_name=payload.display_name,
        email=payload.email,
        phone=payload.phone,
    )
    access_token, raw_refresh = await create_tokens(session, user)
    return H5TokenResponse(
        user=H5UserRead.model_validate(user),
        access_token=access_token,
        refresh_token=raw_refresh,
    )


@router.post(
    "/login",
    response_model=H5TokenResponse,
    summary="Login H5 User",
)
async def h5_login(
    payload: H5LoginRequest,
    session: AsyncSession = SESSION_DEP,
) -> H5TokenResponse:
    """Authenticate an H5 user and return auth tokens."""
    user = await authenticate_h5_user(
        session,
        organization_id=payload.organization_id,
        username=payload.username,
        password=payload.password,
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    access_token, raw_refresh = await create_tokens(session, user)
    return H5TokenResponse(
        user=H5UserRead.model_validate(user),
        access_token=access_token,
        refresh_token=raw_refresh,
    )


@router.post(
    "/refresh",
    response_model=H5AccessTokenResponse,
    summary="Refresh H5 Token",
)
async def h5_refresh(
    payload: H5RefreshRequest,
    session: AsyncSession = SESSION_DEP,
) -> H5AccessTokenResponse:
    """Rotate refresh token and return a new access+refresh token pair."""
    result = await refresh_tokens(session, payload.refresh_token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )
    access_token, new_refresh = result
    return H5AccessTokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
    )


@router.get(
    "/me",
    response_model=H5UserMeResponse,
    summary="Get H5 User Profile",
)
async def h5_me(
    ctx: H5AuthContext = H5_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> H5UserMeResponse:
    """Return the current authenticated H5 user's profile and agent assignments."""
    assignments = await get_user_assignments(session, ctx.h5_user.id)
    return H5UserMeResponse(
        user=H5UserRead.model_validate(ctx.h5_user),
        assignments=[H5AssignmentRead.model_validate(a) for a in assignments],
    )


@router.patch(
    "/me",
    response_model=H5UserRead,
    summary="Update H5 User Profile",
)
async def h5_update_me(
    payload: H5UserUpdate,
    ctx: H5AuthContext = H5_AUTH_DEP,
    session: AsyncSession = SESSION_DEP,
) -> H5UserRead:
    """Update profile fields for the current authenticated H5 user."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return H5UserRead.model_validate(ctx.h5_user)

    updates["updated_at"] = utcnow()
    await crud.patch(session, ctx.h5_user, updates)
    return H5UserRead.model_validate(ctx.h5_user)
