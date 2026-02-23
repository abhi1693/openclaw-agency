"""看板状态快照服务，用于 WebSocket 初次连接时的全量数据下发 (M9)。

获取看板的完整任务列表，确保新连接的客户端在订阅增量更新前
先收到完整的 board.state 快照。
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
    """将 Task ORM 对象序列化为 board.state 消息所需的纯字典格式。"""
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
    """获取看板完整状态快照，用于 WebSocket 初次连接时下发。

    返回可直接序列化并发送的 board.state 消息字典。
    """
    # 懒加载：延迟至函数调用时再导入 app.models，避免模块加载时触发
    # app/models/__init__.py 中对尚未实现的其他模块（如 M11）的依赖。
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
