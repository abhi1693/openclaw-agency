"""Integration tests for agent team CRUD and member management endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_team(client: AsyncClient, admin_headers: dict) -> None:
    """Creating an agent team returns 200 with team data."""
    response = await client.post(
        "/api/v1/agent-teams",
        json={"name": "Test Team", "team_type": "custom"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Team"
    assert data["team_type"] == "custom"
    assert data["member_count"] == 0
    assert "id" in data


@pytest.mark.asyncio
async def test_list_teams(client: AsyncClient, admin_headers: dict) -> None:
    """Listing teams returns a list."""
    response = await client.get("/api/v1/agent-teams", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_get_team(client: AsyncClient, admin_headers: dict) -> None:
    """Getting a specific team by id returns 200."""
    create_resp = await client.post(
        "/api/v1/agent-teams",
        json={"name": "Detail Team", "team_type": "task_force"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    team_id = create_resp.json()["id"]

    get_resp = await client.get(f"/api/v1/agent-teams/{team_id}", headers=admin_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == team_id


@pytest.mark.asyncio
async def test_update_team(client: AsyncClient, admin_headers: dict) -> None:
    """Patching a team updates specified fields."""
    create_resp = await client.post(
        "/api/v1/agent-teams",
        json={"name": "Update Me", "team_type": "custom"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    team_id = create_resp.json()["id"]

    update_resp = await client.patch(
        f"/api/v1/agent-teams/{team_id}",
        json={"name": "Updated Name"},
        headers=admin_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_delete_team(client: AsyncClient, admin_headers: dict) -> None:
    """Deleting a team returns ok=True."""
    create_resp = await client.post(
        "/api/v1/agent-teams",
        json={"name": "Delete Me", "team_type": "custom"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    team_id = create_resp.json()["id"]

    delete_resp = await client.delete(
        f"/api/v1/agent-teams/{team_id}",
        headers=admin_headers,
    )
    assert delete_resp.status_code == 200
    assert delete_resp.json()["ok"] is True


@pytest.mark.asyncio
async def test_team_not_found(client: AsyncClient, admin_headers: dict) -> None:
    """Getting a non-existent team returns 404."""
    response = await client.get(
        "/api/v1/agent-teams/00000000-0000-0000-0000-000000000000",
        headers=admin_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_capability_search(client: AsyncClient, admin_headers: dict) -> None:
    """Capability search endpoint returns a valid response."""
    response = await client.get(
        "/api/v1/agent-capabilities/search?capabilities=python",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "agents" in data
    assert isinstance(data["agents"], list)
