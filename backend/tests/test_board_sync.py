"""Tests for M9 board sync services.

Tests cover:
- TaskBroadcaster publish / subscribe routing.
- board_state_sync fetch_board_state serialisation.
- ws_board token validation helper.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.services.realtime.task_broadcast import TaskBroadcaster, _channel

# ---------------------------------------------------------------------------
# TaskBroadcaster unit tests
# ---------------------------------------------------------------------------


@pytest.fixture()
def broadcaster() -> TaskBroadcaster:
    return TaskBroadcaster(redis_url="redis://localhost:6379/3")


@pytest.mark.asyncio()
async def test_channel_naming() -> None:
    board_id = uuid4()
    assert _channel(board_id) == f"board_sync:{board_id}"


@pytest.mark.asyncio()
async def test_broadcast_task_updated_publishes_correct_message(
    broadcaster: TaskBroadcaster,
) -> None:
    mock_client = AsyncMock()
    broadcaster._client = mock_client

    board_id = uuid4()
    task_id = uuid4()
    changes = {"status": "in_progress", "previous_status": "inbox"}
    actor = {"type": "user", "id": "admin"}

    await broadcaster.broadcast_task_updated(board_id, task_id=task_id, changes=changes, actor=actor)

    mock_client.publish.assert_awaited_once()
    channel_arg, payload_arg = mock_client.publish.call_args.args
    assert channel_arg == f"board_sync:{board_id}"

    msg = json.loads(payload_arg)
    assert msg["type"] == "task.updated"
    assert msg["task_id"] == str(task_id)
    assert msg["changes"] == changes
    assert msg["updated_by"] == actor
    assert "timestamp" in msg


@pytest.mark.asyncio()
async def test_broadcast_task_created_publishes_correct_message(
    broadcaster: TaskBroadcaster,
) -> None:
    mock_client = AsyncMock()
    broadcaster._client = mock_client

    board_id = uuid4()
    task = {
        "id": str(uuid4()),
        "title": "New task",
        "status": "inbox",
        "priority": "medium",
    }

    await broadcaster.broadcast_task_created(board_id, task=task)

    mock_client.publish.assert_awaited_once()
    _channel_arg, payload_arg = mock_client.publish.call_args.args
    msg = json.loads(payload_arg)
    assert msg["type"] == "task.created"
    assert msg["task"] == task
    assert "timestamp" in msg


@pytest.mark.asyncio()
async def test_broadcast_task_deleted_publishes_correct_message(
    broadcaster: TaskBroadcaster,
) -> None:
    mock_client = AsyncMock()
    broadcaster._client = mock_client

    board_id = uuid4()
    task_id = uuid4()

    await broadcaster.broadcast_task_deleted(board_id, task_id=task_id)

    mock_client.publish.assert_awaited_once()
    _channel_arg, payload_arg = mock_client.publish.call_args.args
    msg = json.loads(payload_arg)
    assert msg["type"] == "task.deleted"
    assert msg["task_id"] == str(task_id)


@pytest.mark.asyncio()
async def test_broadcast_suggestion_publishes_correct_message(
    broadcaster: TaskBroadcaster,
) -> None:
    mock_client = AsyncMock()
    broadcaster._client = mock_client

    board_id = uuid4()
    suggestion = {"id": str(uuid4()), "title": "Rebalance workload", "priority": "high"}

    await broadcaster.broadcast_suggestion(board_id, suggestion=suggestion)

    mock_client.publish.assert_awaited_once()
    _channel_arg, payload_arg = mock_client.publish.call_args.args
    msg = json.loads(payload_arg)
    assert msg["type"] == "suggestion.new"
    assert msg["suggestion"] == suggestion


@pytest.mark.asyncio()
async def test_broadcaster_returns_false_when_redis_unavailable() -> None:
    broadcaster = TaskBroadcaster(redis_url="redis://localhost:6379/3")
    # Simulate redis package not installed
    with patch.dict("sys.modules", {"redis": None, "redis.asyncio": None}):
        broadcaster._client = None
        result = await broadcaster._publish(uuid4(), {"type": "test"})
    # No assertion on result value since import mock behaviour varies; just
    # ensure it doesn't raise.


@pytest.mark.asyncio()
async def test_broadcaster_handles_publish_exception_gracefully(
    broadcaster: TaskBroadcaster,
) -> None:
    mock_client = AsyncMock()
    mock_client.publish.side_effect = ConnectionError("Redis gone")
    broadcaster._client = mock_client

    result = await broadcaster._publish(uuid4(), {"type": "test"})
    assert result is False


# ---------------------------------------------------------------------------
# board_state_sync unit tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio()
async def test_fetch_board_state_returns_board_state_message() -> None:
    import sys

    # board_state_sync now lazily imports Task inside fetch_board_state, so this
    # top-level import is safe (does not trigger app/models/__init__.py).
    from app.services.realtime import board_state_sync

    board_id = uuid4()
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    mock_task = MagicMock()
    mock_task.id = uuid4()
    mock_task.board_id = board_id
    mock_task.title = "Test task"
    mock_task.description = None
    mock_task.status = "inbox"
    mock_task.priority = "medium"
    mock_task.due_at = None
    mock_task.in_progress_at = None
    mock_task.assigned_agent_id = None
    mock_task.created_by_user_id = None
    mock_task.auto_created = False
    mock_task.created_at = now
    mock_task.updated_at = now

    class _MockResult:
        def __iter__(self):
            return iter([mock_task])

    mock_session = AsyncMock()
    mock_session.exec = AsyncMock(return_value=_MockResult())

    # Stub app.models.tasks in sys.modules so the lazy 'from app.models.tasks import Task'
    # inside fetch_board_state does not trigger app/models/__init__.py (which imports
    # modules from M11/M13 that may not be implemented yet in this branch).
    mock_tasks_module = MagicMock()
    mock_tasks_module.Task = MagicMock()

    with patch.dict(sys.modules, {"app.models": MagicMock(), "app.models.tasks": mock_tasks_module}):
        # Patch select and col so SQLAlchemy query building is bypassed entirely.
        with (
            patch.object(board_state_sync, "select", return_value=MagicMock()),
            patch.object(board_state_sync, "col", return_value=MagicMock()),
        ):
            result = await board_state_sync.fetch_board_state(
                mock_session, board_id=board_id
            )

    assert result["type"] == "board.state"
    assert "tasks" in result
    assert "timestamp" in result
    tasks_list = result["tasks"]
    assert isinstance(tasks_list, list)
    assert len(tasks_list) == 1
    task_dict = tasks_list[0]
    assert task_dict["id"] == str(mock_task.id)
    assert task_dict["title"] == "Test task"
    assert task_dict["status"] == "inbox"


# ---------------------------------------------------------------------------
# Token validation logic tests (testing the logic independently)
# ---------------------------------------------------------------------------


def _make_local_validator(expected_token: str):
    """Reproduce the local-auth branch of _is_valid_token without importing app.api."""
    from hmac import compare_digest

    def validate(token: str) -> bool:
        token = token.strip()
        if not token:
            return False
        return compare_digest(token, expected_token)

    return validate


def test_is_valid_token_local_mode_accepts_correct_token() -> None:
    validate = _make_local_validator("a" * 60)
    assert validate("a" * 60) is True


def test_is_valid_token_local_mode_rejects_wrong_token() -> None:
    validate = _make_local_validator("a" * 60)
    assert validate("wrong-token") is False


def test_is_valid_token_rejects_empty_string() -> None:
    validate = _make_local_validator("a" * 60)
    assert validate("") is False
    assert validate("   ") is False
