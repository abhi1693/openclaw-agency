"""Board state snapshot service for initial WebSocket board sync (M9).

Fetches the full task list for a board so newly connected clients receive a
complete board.state payload before subscribing to incremental updates.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlmodel import col, select

from app.core.logging import get_logger

if TYPE_CHECKING:
    from app.models.tasks import Task
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = get_logger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _task_to_dict(task: Any) -> dict[str, object]:
    """Serialize a Task ORM object to a plain dict for the board.state payload."""
    return {
        "id": str(task.id),
        "board_id": str(task.board_id) if task.board_id else None,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_at": task.due_at.isoformat() if task.due_at else None,
        "in_progress_at": task.in_progress_at.isoformat() if task.in_progress_at else None,
        "assigned_agent_id": (
            str(task.assigned_agent_id) if task.assigned_agent_id else None
        ),
        "created_by_user_id": (
            str(task.created_by_user_id) if task.created_by_user_id else None
        ),
        "auto_created": task.auto_created,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
    }


async def fetch_board_state(
    session: AsyncSession,
    *,
    board_id: UUID,
) -> dict[str, object]:
    """Fetch a full board state snapshot for initial WebSocket delivery.

    Returns a board.state message dict ready to be serialized and sent.
    """
    # Lazy import: defers loading app.models (and its __init__ dependencies) until
    # this function is actually called, rather than at module import time.
    from app.models.tasks import Task  # noqa: PLC0415

    tasks = list(
        await session.exec(
            select(Task)
            .where(col(Task.board_id) == board_id)
            .order_by(col(Task.created_at).desc()),
        )
    )
    task_dicts = [_task_to_dict(t) for t in tasks]
    logger.debug(
        "board_state_sync.fetch board_id=%s task_count=%s", board_id, len(task_dicts)
    )
    return {
        "type": "board.state",
        "tasks": task_dicts,
        "timestamp": _utc_now_iso(),
    }
