"""Persistent sparkline store for mc-backend RSS memory readings.

Appends { ts, mb } entries to a JSON file and trims to MAX_ENTRIES.
Hydrated from disk on import so history survives backend restarts.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

_CACHE_FILE = Path.home() / ".openclaw" / "workspace" / "cache" / "mc-health-sparkline.json"
_MAX_ENTRIES = 120

_readings: list[dict] = []


def _load() -> None:
    global _readings
    try:
        data = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            _readings = data[-_MAX_ENTRIES:]
    except Exception:
        _readings = []


def append(mb: float) -> None:
    """Append a new RSS reading and persist to disk (trimmed to MAX_ENTRIES)."""
    _readings.append({"ts": int(time.time() * 1000), "mb": round(mb, 2)})
    if len(_readings) > _MAX_ENTRIES:
        del _readings[:-_MAX_ENTRIES]
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _CACHE_FILE.write_text(json.dumps(_readings), encoding="utf-8")
    except Exception:
        pass


def get_readings() -> list[dict]:
    """Return a copy of the current in-memory readings list."""
    return list(_readings)


# Hydrate from disk on module import (i.e. on backend startup)
_load()
