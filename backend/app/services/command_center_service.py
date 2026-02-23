"""Command Center live metrics aggregation service."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import func
from sqlmodel import col, select

from app.core.time import utcnow
from app.models.agent_events import AgentEvent
from app.models.agents import Agent
from app.models.gateways import Gateway
from app.models.tasks import Task
from app.schemas.command_center import (
    AgentStatusItem,
    AgentStatusResponse,
    CommandCenterOverview,
    CommunicationGraphEdge,
    CommunicationGraphNode,
    CommunicationGraphResponse,
    LiveActivityEvent,
    LiveActivityResponse,
    ResourceAllocationItem,
    ResourceAllocationResponse,
)

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

_ACTIVE_THRESHOLD_MINUTES = 30


class CommandCenterService:
    """Service for aggregating Command Center live metrics."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_overview(self, organization_id: UUID) -> CommandCenterOverview:
        """Aggregate high-level KPIs for the Command Center."""
        now = utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        active_threshold = now - timedelta(minutes=_ACTIVE_THRESHOLD_MINUTES)
        week_ago = now - timedelta(days=7)

        # Active agents (seen within threshold)
        active_agents_stmt = select(func.count(Agent.id)).where(
            col(Agent.last_seen_at).is_not(None),
            col(Agent.last_seen_at) >= active_threshold,
        )
        active_agents = int((await self._session.exec(active_agents_stmt)).one() or 0)

        # Tasks created today
        tasks_today_stmt = select(func.count(Task.id)).where(
            col(Task.created_at) >= today_start,
        )
        tasks_today = int((await self._session.exec(tasks_today_stmt)).one() or 0)

        # Throughput in last 7 days (tasks moved to review/done)
        throughput_stmt = select(func.count(Task.id)).where(
            col(Task.status).in_(["review", "done"]),
            col(Task.updated_at) >= week_ago,
        )
        throughput_7d = int((await self._session.exec(throughput_stmt)).one() or 0)

        # Online gateways
        gateways_stmt = select(func.count(Gateway.id)).where(
            col(Gateway.status) == "online",
        )
        gateways_online = int((await self._session.exec(gateways_stmt)).one() or 0)

        return CommandCenterOverview(
            active_agents=active_agents,
            tasks_today=tasks_today,
            throughput_7d=throughput_7d,
            gateways_online=gateways_online,
            generated_at=now,
        )

    async def get_agent_status(self) -> AgentStatusResponse:
        """Get live status for all agents."""
        agents_stmt = select(Agent).order_by(col(Agent.last_seen_at).desc())
        agents = list((await self._session.exec(agents_stmt)).all())

        # Load gateways for name lookup
        gateways_stmt = select(Gateway)
        gateways = list((await self._session.exec(gateways_stmt)).all())
        gateway_name_by_id: dict[UUID, str] = {gw.id: gw.name for gw in gateways}

        # Load in-progress tasks per agent
        in_progress_stmt = select(Task).where(col(Task.status) == "in_progress")
        in_progress_tasks = list((await self._session.exec(in_progress_stmt)).all())
        task_by_agent: dict[UUID, Task] = {}
        for task in in_progress_tasks:
            if task.assigned_agent_id and task.assigned_agent_id not in task_by_agent:
                task_by_agent[task.assigned_agent_id] = task

        items: list[AgentStatusItem] = []
        for agent in agents:
            current_task = task_by_agent.get(agent.id)
            items.append(
                AgentStatusItem(
                    id=agent.id,
                    name=agent.name,
                    status=agent.status,
                    current_task_id=current_task.id if current_task else None,
                    current_task_title=current_task.title if current_task else None,
                    gateway_id=agent.gateway_id,
                    gateway_name=gateway_name_by_id.get(agent.gateway_id),
                    last_seen_at=agent.last_seen_at,
                )
            )
        return AgentStatusResponse(agents=items)

    async def get_communication_graph(self, organization_id: UUID) -> CommunicationGraphResponse:
        """Build agent communication graph from agent_events interactions."""
        # Load all agents
        agents_stmt = select(Agent)
        agents = list((await self._session.exec(agents_stmt)).all())

        nodes: list[CommunicationGraphNode] = [
            CommunicationGraphNode(
                id=str(agent.id),
                name=agent.name,
                status=agent.status,
                gateway_id=str(agent.gateway_id),
            )
            for agent in agents
        ]

        # Build edges from agent_events: count events where agent_id and board_id pair with tasks
        # Use a simple approach: count events per (source_agent, target_agent) from coordination
        thirty_days_ago = utcnow() - timedelta(days=30)
        events_stmt = select(AgentEvent).where(
            col(AgentEvent.organization_id) == organization_id,
            col(AgentEvent.created_at) >= thirty_days_ago,
            col(AgentEvent.agent_id).is_not(None),
        )
        events = list((await self._session.exec(events_stmt)).all())

        # Build interaction counts from event payload if from_agent_id present
        edge_counts: dict[tuple[str, str], int] = {}
        for event in events:
            payload = event.payload or {}
            from_id = str(event.agent_id) if event.agent_id else None
            to_id = payload.get("target_agent_id") or payload.get("to_agent_id")
            if from_id and to_id and from_id != to_id:
                key = (from_id, str(to_id))
                edge_counts[key] = edge_counts.get(key, 0) + 1

        edges: list[CommunicationGraphEdge] = [
            CommunicationGraphEdge(
                from_agent_id=from_id,
                to_agent_id=to_id,
                weight=float(count),
                interaction_count=count,
            )
            for (from_id, to_id), count in edge_counts.items()
        ]

        return CommunicationGraphResponse(nodes=nodes, edges=edges)

    async def get_resource_allocation(self) -> ResourceAllocationResponse:
        """Get per-agent task distribution and resource load."""
        now = utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        agents_stmt = select(Agent).order_by(col(Agent.name))
        agents = list((await self._session.exec(agents_stmt)).all())
        agent_ids = [a.id for a in agents]

        if not agent_ids:
            return ResourceAllocationResponse(per_agent=[])

        # Load tasks for all agents in one query
        tasks_stmt = select(Task).where(
            col(Task.assigned_agent_id).in_(agent_ids),
        )
        tasks = list((await self._session.exec(tasks_stmt)).all())

        # Group by agent
        by_agent: dict[UUID, list[Task]] = {}
        for task in tasks:
            if task.assigned_agent_id:
                by_agent.setdefault(task.assigned_agent_id, []).append(task)

        items: list[ResourceAllocationItem] = []
        for agent in agents:
            agent_tasks = by_agent.get(agent.id, [])
            assigned = len(agent_tasks)
            in_progress = sum(1 for t in agent_tasks if t.status == "in_progress")
            done_today = sum(
                1 for t in agent_tasks if t.status == "done" and t.updated_at >= today_start
            )
            estimated_hours = float(in_progress * 4)  # rough 4h per in-progress task

            items.append(
                ResourceAllocationItem(
                    agent_id=agent.id,
                    agent_name=agent.name,
                    tasks_assigned=assigned,
                    tasks_in_progress=in_progress,
                    tasks_done_today=done_today,
                    estimated_hours=estimated_hours,
                )
            )

        return ResourceAllocationResponse(per_agent=items)

    async def get_live_activity(
        self,
        organization_id: UUID,
        limit: int = 50,
        since_id: UUID | None = None,
    ) -> LiveActivityResponse:
        """Fetch recent agent events for the live activity stream."""
        # Load agent names for display
        agents_stmt = select(Agent)
        agents = list((await self._session.exec(agents_stmt)).all())
        agent_name_by_id: dict[UUID, str] = {a.id: a.name for a in agents}

        statement = (
            select(AgentEvent)
            .where(col(AgentEvent.organization_id) == organization_id)
            .order_by(col(AgentEvent.created_at).desc())
            .limit(limit)
        )
        if since_id is not None:
            # Get the created_at of the since_id event
            since_stmt = select(AgentEvent).where(col(AgentEvent.id) == since_id)
            since_event = (await self._session.exec(since_stmt)).one_or_none()
            if since_event is not None:
                statement = statement.where(
                    col(AgentEvent.created_at) < since_event.created_at
                )

        events = list((await self._session.exec(statement)).all())

        items: list[LiveActivityEvent] = [
            LiveActivityEvent(
                id=event.id,
                event_type=event.event_type,
                agent_id=event.agent_id,
                agent_name=agent_name_by_id.get(event.agent_id) if event.agent_id else None,
                task_id=event.task_id,
                board_id=event.board_id,
                payload=event.payload,
                created_at=event.created_at,
            )
            for event in events
        ]

        next_since_id = events[-1].id if events else None
        return LiveActivityResponse(events=items, next_since_id=next_since_id)
