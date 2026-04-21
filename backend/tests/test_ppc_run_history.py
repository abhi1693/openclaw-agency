"""Tests for PPC run history service and endpoints."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.core.time import utcnow
from app.services.ppc_entity_snapshots import _freshness_state
from app.services.ppc_run_history import (
    list_run_history,
    log_run_end,
    log_run_start,
)


@pytest.mark.asyncio
class TestLogRunStart:
    async def test_creates_run_history_entry(self) -> None:
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        run = await log_run_start(mock_session, "snapshot_sync", "system")

        assert run.run_type == "snapshot_sync"
        assert run.status == "started"
        assert run.triggered_by == "system"
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()


@pytest.mark.asyncio
class TestLogRunEnd:
    async def test_updates_run_with_results(self) -> None:
        run_id = uuid4()
        mock_session = AsyncMock()
        mock_run = MagicMock()
        mock_run.started_at = utcnow() - timedelta(seconds=5)

        mock_result = MagicMock()
        mock_result.first.return_value = mock_run
        mock_session.exec.return_value = mock_result
        mock_session.commit = AsyncMock()

        await log_run_end(
            mock_session,
            run_id,
            "completed",
            entities_scanned=10,
            entities_created=2,
            entities_updated=8,
        )

        assert mock_run.status == "completed"
        assert mock_run.entities_scanned == 10
        assert mock_run.entities_created == 2
        assert mock_run.entities_updated == 8
        assert mock_run.duration_ms is not None
        mock_session.commit.assert_called_once()

    async def test_handles_not_found(self) -> None:
        run_id = uuid4()
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.first.return_value = None
        mock_session.exec.return_value = mock_result

        await log_run_end(mock_session, run_id, "completed")

        mock_session.commit.assert_not_called()


@pytest.mark.asyncio
class TestListRunHistory:
    async def test_filters_by_run_type(self) -> None:
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.__iter__.return_value = iter([])

        mock_count_result = MagicMock()
        mock_count_result.one.return_value = 0

        with patch.object(
            mock_session,
            "exec",
            side_effect=[mock_result, mock_count_result],
        ):
            rows, total = await list_run_history(
                mock_session,
                run_type="snapshot_sync",
            )

        assert rows == []
        assert total == 0


class TestFreshnessAlertThresholds:
    """Test alert field logic in get_entity_freshness."""

    def test_fresh_threshold(self) -> None:
        stale, alert = _freshness_state(3599, 3600)

        assert stale is False
        assert alert is None

    def test_stale_threshold(self) -> None:
        stale, alert = _freshness_state(3601, 3600)

        assert stale is True
        assert alert == "stale"

    def test_critical_threshold(self) -> None:
        stale, alert = _freshness_state(7201, 3600)

        assert stale is True
        assert alert == "critical"

    def test_none_age_is_not_stale(self) -> None:
        stale, alert = _freshness_state(None, 3600)

        assert stale is False
        assert alert is None
