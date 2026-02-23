"""Integration tests for the Command Center dashboard API endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_command_center_overview(client: AsyncClient, admin_headers: dict) -> None:
    """Overview endpoint returns KPI fields."""
    response = await client.get(
        "/api/v1/command-center/overview",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "active_agents" in data
    assert "tasks_today" in data
    assert "throughput_7d" in data
    assert "gateways_online" in data
    assert "generated_at" in data
    assert isinstance(data["active_agents"], int)


@pytest.mark.asyncio
async def test_command_center_agent_status(client: AsyncClient, admin_headers: dict) -> None:
    """Agent status endpoint returns agents list."""
    response = await client.get(
        "/api/v1/command-center/agent-status",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "agents" in data
    assert isinstance(data["agents"], list)


@pytest.mark.asyncio
async def test_command_center_communication_graph(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Communication graph endpoint returns nodes and edges."""
    response = await client.get(
        "/api/v1/command-center/communication-graph",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
    assert isinstance(data["nodes"], list)
    assert isinstance(data["edges"], list)


@pytest.mark.asyncio
async def test_command_center_resource_allocation(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Resource allocation endpoint returns per_agent list."""
    response = await client.get(
        "/api/v1/command-center/resource-allocation",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "per_agent" in data
    assert isinstance(data["per_agent"], list)


@pytest.mark.asyncio
async def test_command_center_live_activity(client: AsyncClient, admin_headers: dict) -> None:
    """Live activity endpoint returns events list."""
    response = await client.get(
        "/api/v1/command-center/live-activity?limit=10",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "events" in data
    assert isinstance(data["events"], list)


@pytest.mark.asyncio
async def test_command_center_live_activity_limit(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Live activity limit parameter is respected."""
    response = await client.get(
        "/api/v1/command-center/live-activity?limit=5",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["events"]) <= 5
