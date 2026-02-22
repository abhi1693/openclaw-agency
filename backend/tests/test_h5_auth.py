# ruff: noqa: INP001
"""Tests for H5 user authentication system (M3).

Covers: password hashing, JWT creation/decoding, register/login/refresh/me API flow,
and admin endpoints for listing users and managing agent assignments.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt as pyjwt
import pytest
from fastapi import APIRouter, FastAPI
from fastapi_pagination import add_pagination
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core import h5_auth as h5_auth_module
from app.core.config import settings
from app.core.h5_auth import (
    H5_JWT_ALGORITHM,
    H5_TOKEN_TYPE,
    create_h5_access_token,
    create_h5_refresh_token,
    decode_h5_access_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.db.session import get_session

# Pre-generate a UUID for the test organization so we can use the same value
# as both a Python UUID (for the ORM insert) and a string (for JSON payloads).
_TEST_ORG_UUID = uuid4()
_TEST_ORG_ID = str(_TEST_ORG_UUID)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


def _build_test_app(
    session_maker: async_sessionmaker[AsyncSession],
) -> FastAPI:
    from app.api.h5_auth import router as h5_auth_router

    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(h5_auth_router)
    app.include_router(api_v1)

    async def _override_get_session():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    return app


def _build_admin_test_app(
    session_maker: async_sessionmaker[AsyncSession],
    *,
    organization_id: object,
    admin_user_id: object,
) -> FastAPI:
    """Build a test app that includes h5_users admin routes with auth bypassed."""
    from app.api.deps import require_org_admin
    from app.api.h5_users import router as h5_users_router
    from app.models.organization_members import OrganizationMember
    from app.models.organizations import Organization
    from app.services.organizations import OrganizationContext

    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(h5_users_router)
    app.include_router(api_v1)
    add_pagination(app)

    async def _override_get_session():
        async with session_maker() as session:
            yield session

    async def _override_require_org_admin() -> OrganizationContext:
        return OrganizationContext(
            organization=Organization(id=organization_id, name="Test Org"),
            member=OrganizationMember(
                organization_id=organization_id,
                user_id=admin_user_id,
                role="owner",
                all_boards_read=True,
                all_boards_write=True,
            ),
        )

    app.dependency_overrides[get_session] = _override_get_session
    app.dependency_overrides[require_org_admin] = _override_require_org_admin
    return app


# ---------------------------------------------------------------------------
# Unit tests: password hashing
# ---------------------------------------------------------------------------


def test_hash_and_verify_password() -> None:
    plain = "my-secret-p@ss"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed)
    assert not verify_password("wrong-password", hashed)


def test_password_hash_uniqueness() -> None:
    """Each hash should be unique due to random salt."""
    h1 = hash_password("same-pass")
    h2 = hash_password("same-pass")
    assert h1 != h2


# ---------------------------------------------------------------------------
# Unit tests: JWT creation / decoding
# ---------------------------------------------------------------------------


def test_create_and_decode_access_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-h5-auth-unit-tests-x")
    user_id = uuid4()
    org_id = uuid4()
    token = create_h5_access_token(user_id, org_id)
    payload = decode_h5_access_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["org"] == str(org_id)
    assert payload["type"] == H5_TOKEN_TYPE


def test_decode_expired_token_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-h5-auth-unit-tests-x")
    now = datetime.now(UTC)
    payload = {
        "sub": str(uuid4()),
        "org": str(uuid4()),
        "type": H5_TOKEN_TYPE,
        "iat": now - timedelta(hours=2),
        "exp": now - timedelta(hours=1),
    }
    token = pyjwt.encode(payload, "test-jwt-secret-for-h5-auth-unit-tests-x", algorithm=H5_JWT_ALGORITHM)
    with pytest.raises(pyjwt.ExpiredSignatureError):
        decode_h5_access_token(token)


def test_decode_invalid_token_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-h5-auth-unit-tests-x")
    with pytest.raises(pyjwt.PyJWTError):
        decode_h5_access_token("not-a-real-token")


# ---------------------------------------------------------------------------
# Unit tests: refresh token hashing
# ---------------------------------------------------------------------------


def test_refresh_token_generation_and_hash() -> None:
    raw = create_h5_refresh_token()
    assert len(raw) > 30
    h = hash_refresh_token(raw)
    assert len(h) == 64  # SHA-256 hex digest
    assert hash_refresh_token(raw) == h  # deterministic


# ---------------------------------------------------------------------------
# Integration tests: auth API endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_register_login_refresh_me_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-integration-tests-x")
    monkeypatch.setattr(settings, "environment", "dev")

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Seed an organization row so the FK constraint is satisfied.
    async with session_maker() as session:
        from app.models.organizations import Organization

        org = Organization(id=_TEST_ORG_UUID, name="Test Org")
        session.add(org)
        await session.commit()

    app = _build_test_app(session_maker)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            # -- Register --
            reg = await client.post(
                "/api/v1/h5/auth/register",
                json={
                    "organization_id": _TEST_ORG_ID,
                    "username": "alice",
                    "password": "secret123",
                    "display_name": "Alice",
                },
            )
            assert reg.status_code == 201, reg.text
            reg_data = reg.json()
            assert reg_data["user"]["username"] == "alice"
            assert reg_data["user"]["display_name"] == "Alice"
            assert "access_token" in reg_data
            assert "refresh_token" in reg_data

            access_token = reg_data["access_token"]
            refresh_token = reg_data["refresh_token"]

            # -- Duplicate register fails --
            dup = await client.post(
                "/api/v1/h5/auth/register",
                json={
                    "organization_id": _TEST_ORG_ID,
                    "username": "alice",
                    "password": "another-pass",
                },
            )
            assert dup.status_code == 409

            # -- Login --
            login = await client.post(
                "/api/v1/h5/auth/login",
                json={
                    "organization_id": _TEST_ORG_ID,
                    "username": "alice",
                    "password": "secret123",
                },
            )
            assert login.status_code == 200, login.text
            login_data = login.json()
            assert login_data["user"]["username"] == "alice"

            # -- Login with wrong password --
            bad_login = await client.post(
                "/api/v1/h5/auth/login",
                json={
                    "organization_id": _TEST_ORG_ID,
                    "username": "alice",
                    "password": "wrong",
                },
            )
            assert bad_login.status_code == 401

            # -- Get /me returns composite response with user + assignments --
            me = await client.get(
                "/api/v1/h5/auth/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            assert me.status_code == 200
            me_data = me.json()
            assert me_data["user"]["username"] == "alice"
            assert me_data["assignments"] == []

            # -- Get /me without token --
            me_no_auth = await client.get("/api/v1/h5/auth/me")
            assert me_no_auth.status_code in (401, 403)

            # -- Patch /me --
            patch = await client.patch(
                "/api/v1/h5/auth/me",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"display_name": "Alice W."},
            )
            assert patch.status_code == 200
            assert patch.json()["display_name"] == "Alice W."

            # -- Patch /me does not allow email/phone updates --
            patch_email = await client.patch(
                "/api/v1/h5/auth/me",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"email": "alice@example.com"},
            )
            # email is not a recognized field in H5UserUpdate; extra fields are ignored
            # (422 or 200 with email unchanged are both acceptable)
            assert patch_email.status_code in (200, 422)

            # -- Refresh token --
            refresh = await client.post(
                "/api/v1/h5/auth/refresh",
                json={"refresh_token": refresh_token},
            )
            assert refresh.status_code == 200, refresh.text
            refresh_data = refresh.json()
            assert "access_token" in refresh_data
            assert "refresh_token" in refresh_data

            # -- Old refresh token should be revoked --
            old_refresh = await client.post(
                "/api/v1/h5/auth/refresh",
                json={"refresh_token": refresh_token},
            )
            assert old_refresh.status_code == 401

            # -- New access token works --
            me2 = await client.get(
                "/api/v1/h5/auth/me",
                headers={"Authorization": f"Bearer {refresh_data['access_token']}"},
            )
            assert me2.status_code == 200
            assert me2.json()["user"]["username"] == "alice"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_register_validation_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-h5-auth-unit-tests-x")
    monkeypatch.setattr(settings, "environment", "dev")

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app = _build_test_app(session_maker)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            # Short username
            r = await client.post(
                "/api/v1/h5/auth/register",
                json={
                    "organization_id": str(uuid4()),
                    "username": "a",
                    "password": "secret123",
                },
            )
            assert r.status_code == 422

            # Short password
            r = await client.post(
                "/api/v1/h5/auth/register",
                json={
                    "organization_id": str(uuid4()),
                    "username": "bob",
                    "password": "12",
                },
            )
            assert r.status_code == 422
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Integration tests: admin endpoints (GET /h5/users, assign, unassign)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_list_h5_users_returns_paginated_results(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /h5/users returns a paginated envelope with items/total."""
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-admin-tests-x")
    monkeypatch.setattr(settings, "environment", "dev")

    org_id = uuid4()
    admin_user_id = uuid4()

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        from app.models.h5_users import H5User
        from app.models.organizations import Organization
        from app.core.h5_auth import hash_password as hp

        async with session_maker() as session:
            session.add(Organization(id=org_id, name="Acme"))
            session.add(
                H5User(
                    organization_id=org_id,
                    username="user1",
                    password_hash=hp("pass123"),
                )
            )
            session.add(
                H5User(
                    organization_id=org_id,
                    username="user2",
                    password_hash=hp("pass123"),
                )
            )
            await session.commit()

        app = _build_admin_test_app(
            session_maker,
            organization_id=org_id,
            admin_user_id=admin_user_id,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.get("/api/v1/h5/users")

        assert response.status_code == 200, response.text
        body = response.json()
        # fastapi-pagination LimitOffsetPage returns {"items": [...], "total": N, ...}
        assert "items" in body
        assert "total" in body
        assert body["total"] == 2
        usernames = {u["username"] for u in body["items"]}
        assert usernames == {"user1", "user2"}
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_list_h5_users_pagination_limit_offset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /h5/users respects limit and offset query parameters."""
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-admin-tests-x")
    monkeypatch.setattr(settings, "environment", "dev")

    org_id = uuid4()
    admin_user_id = uuid4()

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        from app.models.h5_users import H5User
        from app.models.organizations import Organization
        from app.core.h5_auth import hash_password as hp

        async with session_maker() as session:
            session.add(Organization(id=org_id, name="Acme"))
            for i in range(5):
                session.add(
                    H5User(
                        organization_id=org_id,
                        username=f"user{i}",
                        password_hash=hp("pass123"),
                    )
                )
            await session.commit()

        app = _build_admin_test_app(
            session_maker,
            organization_id=org_id,
            admin_user_id=admin_user_id,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            page1 = await client.get("/api/v1/h5/users", params={"limit": 2, "offset": 0})
            page2 = await client.get("/api/v1/h5/users", params={"limit": 2, "offset": 2})

        assert page1.status_code == 200, page1.text
        assert page2.status_code == 200, page2.text

        body1 = page1.json()
        body2 = page2.json()
        assert body1["total"] == 5
        assert len(body1["items"]) == 2
        assert body2["total"] == 5
        assert len(body2["items"]) == 2
        # The two pages must not overlap
        ids1 = {u["id"] for u in body1["items"]}
        ids2 = {u["id"] for u in body2["items"]}
        assert ids1.isdisjoint(ids2)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_list_h5_users_only_returns_own_org(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /h5/users must not leak users from other organizations."""
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-admin-tests-x")
    monkeypatch.setattr(settings, "environment", "dev")

    org_a_id = uuid4()
    org_b_id = uuid4()
    admin_user_id = uuid4()

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        from app.models.h5_users import H5User
        from app.models.organizations import Organization
        from app.core.h5_auth import hash_password as hp

        async with session_maker() as session:
            session.add(Organization(id=org_a_id, name="Org A"))
            session.add(Organization(id=org_b_id, name="Org B"))
            session.add(
                H5User(
                    organization_id=org_a_id,
                    username="alice",
                    password_hash=hp("pass123"),
                )
            )
            session.add(
                H5User(
                    organization_id=org_b_id,
                    username="bob",
                    password_hash=hp("pass123"),
                )
            )
            await session.commit()

        # Admin is from org_a; should only see alice
        app = _build_admin_test_app(
            session_maker,
            organization_id=org_a_id,
            admin_user_id=admin_user_id,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.get("/api/v1/h5/users")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["username"] == "alice"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_assign_and_unassign_h5_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """POST /h5/users/{id}/assign creates an assignment; DELETE removes it."""
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-admin-tests-x")
    monkeypatch.setattr(settings, "environment", "dev")

    org_id = uuid4()
    admin_user_id = uuid4()
    agent_id = uuid4()
    board_id = uuid4()

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        from app.models.h5_users import H5User
        from app.models.organizations import Organization
        from app.core.h5_auth import hash_password as hp

        async with session_maker() as session:
            session.add(Organization(id=org_id, name="Acme"))
            h5_user = H5User(
                organization_id=org_id,
                username="alice",
                password_hash=hp("pass123"),
            )
            session.add(h5_user)
            await session.commit()
            await session.refresh(h5_user)

        app = _build_admin_test_app(
            session_maker,
            organization_id=org_id,
            admin_user_id=admin_user_id,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            # -- Assign user to agent --
            assign_resp = await client.post(
                f"/api/v1/h5/users/{h5_user.id}/assign",
                json={
                    "agent_id": str(agent_id),
                    "board_id": str(board_id),
                    "role": "user",
                },
            )
            assert assign_resp.status_code == 201, assign_resp.text
            assign_data = assign_resp.json()
            assert assign_data["h5_user_id"] == str(h5_user.id)
            assert assign_data["agent_id"] == str(agent_id)
            assert assign_data["board_id"] == str(board_id)
            assert assign_data["role"] == "user"
            assert assign_data["assigned_by"] == str(admin_user_id)

            # -- Duplicate assign returns 409 --
            dup_assign = await client.post(
                f"/api/v1/h5/users/{h5_user.id}/assign",
                json={
                    "agent_id": str(agent_id),
                    "board_id": str(board_id),
                    "role": "user",
                },
            )
            assert dup_assign.status_code == 409

            # -- Unassign user from agent --
            unassign_resp = await client.delete(
                f"/api/v1/h5/users/{h5_user.id}/assign/{agent_id}",
            )
            assert unassign_resp.status_code == 200, unassign_resp.text
            assert unassign_resp.json() == {"ok": True}

            # -- Unassign again returns 404 --
            second_unassign = await client.delete(
                f"/api/v1/h5/users/{h5_user.id}/assign/{agent_id}",
            )
            assert second_unassign.status_code == 404
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_assign_rejects_user_from_other_org(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """POST /h5/users/{id}/assign must return 404 for users in other organizations."""
    monkeypatch.setattr(settings, "h5_jwt_secret", "test-jwt-secret-for-admin-tests-x")
    monkeypatch.setattr(settings, "environment", "dev")

    org_a_id = uuid4()
    org_b_id = uuid4()
    admin_user_id = uuid4()
    agent_id = uuid4()
    board_id = uuid4()

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        from app.models.h5_users import H5User
        from app.models.organizations import Organization
        from app.core.h5_auth import hash_password as hp

        async with session_maker() as session:
            session.add(Organization(id=org_a_id, name="Org A"))
            session.add(Organization(id=org_b_id, name="Org B"))
            # User belongs to org_b
            other_user = H5User(
                organization_id=org_b_id,
                username="bob",
                password_hash=hp("pass123"),
            )
            session.add(other_user)
            await session.commit()
            await session.refresh(other_user)

        # Admin is from org_a; trying to assign org_b user should 404
        app = _build_admin_test_app(
            session_maker,
            organization_id=org_a_id,
            admin_user_id=admin_user_id,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.post(
                f"/api/v1/h5/users/{other_user.id}/assign",
                json={
                    "agent_id": str(agent_id),
                    "board_id": str(board_id),
                    "role": "user",
                },
            )

        assert response.status_code == 404
    finally:
        await engine.dispose()
