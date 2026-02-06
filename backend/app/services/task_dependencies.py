from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from typing import Final
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.task_dependencies import TaskDependency
from app.models.tasks import Task

DONE_STATUS: Final[str] = "done"


def _dedupe_uuid_list(values: Sequence[UUID]) -> list[UUID]:
    # Preserve order; remove duplicates.
    seen: set[UUID] = set()
    output: list[UUID] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


async def dependency_ids_by_task_id(
    session: AsyncSession,
    *,
    board_id: UUID,
    task_ids: Sequence[UUID],
) -> dict[UUID, list[UUID]]:
    if not task_ids:
        return {}
    rows = list(
        await session.exec(
            select(col(TaskDependency.task_id), col(TaskDependency.depends_on_task_id))
            .where(col(TaskDependency.board_id) == board_id)
            .where(col(TaskDependency.task_id).in_(task_ids))
            .order_by(col(TaskDependency.created_at).asc())
        )
    )
    mapping: dict[UUID, list[UUID]] = defaultdict(list)
    for task_id, depends_on_task_id in rows:
        mapping[task_id].append(depends_on_task_id)
    return dict(mapping)


async def dependency_status_by_id(
    session: AsyncSession,
    *,
    board_id: UUID,
    dependency_ids: Sequence[UUID],
) -> dict[UUID, str]:
    if not dependency_ids:
        return {}
    rows = list(
        await session.exec(
            select(col(Task.id), col(Task.status))
            .where(col(Task.board_id) == board_id)
            .where(col(Task.id).in_(dependency_ids))
        )
    )
    return {task_id: status_value for task_id, status_value in rows}


def blocked_by_dependency_ids(
    *,
    dependency_ids: Sequence[UUID],
    status_by_id: Mapping[UUID, str],
) -> list[UUID]:
    blocked: list[UUID] = []
    for dep_id in dependency_ids:
        if status_by_id.get(dep_id) != DONE_STATUS:
            blocked.append(dep_id)
    return blocked


async def blocked_by_for_task(
    session: AsyncSession,
    *,
    board_id: UUID,
    task_id: UUID,
    dependency_ids: Sequence[UUID] | None = None,
) -> list[UUID]:
    dep_ids = list(dependency_ids or [])
    if dependency_ids is None:
        deps_map = await dependency_ids_by_task_id(
            session,
            board_id=board_id,
            task_ids=[task_id],
        )
        dep_ids = deps_map.get(task_id, [])
    if not dep_ids:
        return []
    status_by_id = await dependency_status_by_id(session, board_id=board_id, dependency_ids=dep_ids)
    return blocked_by_dependency_ids(dependency_ids=dep_ids, status_by_id=status_by_id)


def _has_cycle(nodes: Sequence[UUID], edges: Mapping[UUID, set[UUID]]) -> bool:
    visited: set[UUID] = set()
    in_stack: set[UUID] = set()

    def dfs(node: UUID) -> bool:
        if node in in_stack:
            return True
        if node in visited:
            return False
        visited.add(node)
        in_stack.add(node)
        for nxt in edges.get(node, set()):
            if dfs(nxt):
                return True
        in_stack.remove(node)
        return False

    for node in nodes:
        if dfs(node):
            return True
    return False


async def validate_dependency_update(
    session: AsyncSession,
    *,
    board_id: UUID,
    task_id: UUID,
    depends_on_task_ids: Sequence[UUID],
) -> list[UUID]:
    normalized = _dedupe_uuid_list(depends_on_task_ids)
    if task_id in normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Task cannot depend on itself.",
        )
    if not normalized:
        return []

    # Ensure all dependency tasks exist on this board.
    existing_ids = set(
        await session.exec(
            select(col(Task.id))
            .where(col(Task.board_id) == board_id)
            .where(col(Task.id).in_(normalized))
        )
    )
    missing = [dep_id for dep_id in normalized if dep_id not in existing_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "message": "One or more dependency tasks were not found on this board.",
                "missing_task_ids": [str(value) for value in missing],
            },
        )

    # Ensure the dependency graph is acyclic after applying the update.
    task_ids = list(await session.exec(select(col(Task.id)).where(col(Task.board_id) == board_id)))
    rows = list(
        await session.exec(
            select(col(TaskDependency.task_id), col(TaskDependency.depends_on_task_id)).where(
                col(TaskDependency.board_id) == board_id
            )
        )
    )
    edges: dict[UUID, set[UUID]] = defaultdict(set)
    for src, dst in rows:
        edges[src].add(dst)
    edges[task_id] = set(normalized)

    if _has_cycle(task_ids, edges):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dependency cycle detected. Remove the cycle before saving.",
        )

    return normalized


async def replace_task_dependencies(
    session: AsyncSession,
    *,
    board_id: UUID,
    task_id: UUID,
    depends_on_task_ids: Sequence[UUID],
) -> list[UUID]:
    normalized = await validate_dependency_update(
        session,
        board_id=board_id,
        task_id=task_id,
        depends_on_task_ids=depends_on_task_ids,
    )
    await session.execute(
        delete(TaskDependency)
        .where(col(TaskDependency.board_id) == board_id)
        .where(col(TaskDependency.task_id) == task_id)
    )
    for dep_id in normalized:
        session.add(
            TaskDependency(
                board_id=board_id,
                task_id=task_id,
                depends_on_task_id=dep_id,
            )
        )
    return normalized


async def dependent_task_ids(
    session: AsyncSession,
    *,
    board_id: UUID,
    dependency_task_id: UUID,
) -> list[UUID]:
    rows = await session.exec(
        select(col(TaskDependency.task_id))
        .where(col(TaskDependency.board_id) == board_id)
        .where(col(TaskDependency.depends_on_task_id) == dependency_task_id)
    )
    return list(rows)
