from __future__ import annotations

from datetime import datetime, timezone

from app.api.health import health_v1


def test_health_v1_returns_ok() -> None:
    before = datetime.now(timezone.utc)
    response = health_v1()
    after = datetime.now(timezone.utc)

    assert response.status == "ok"
    assert isinstance(response.version, str) and len(response.version) > 0
    ts = datetime.fromisoformat(response.timestamp)
    assert before <= ts <= after
    assert response.uptime_seconds >= 0
