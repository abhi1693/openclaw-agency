# ruff: noqa: INP001
"""aiosqlite engine disposal helpers for test fixtures.

This module provides a registration mechanism so that async engines created
during tests can be automatically disposed by the _dispose_aiosqlite_engines
fixture defined in conftest.py.
"""

import threading

import pytest
import pytest_asyncio


_engine_tracker: set[object] = set()
_tracker_lock = threading.Lock()


def register_async_engine(engine: object) -> None:
    """Register an async engine (e.g. sqlalchemy AsyncEngine) for disposal.

    Call this after creating an aiosqlite-based engine in a test to ensure
    it is properly disposed after the test completes.
    """
    with _tracker_lock:
        _engine_tracker.add(engine)


@pytest_asyncio.fixture(autouse=True)
async def _dispose_aiosqlite_engines():
    """Dispose all aiosqlite-based engines registered during the test.

    This async fixture runs after each async test, ensuring the event loop is
    still open when we dispose.  The fixture is autouse so it covers all async
    tests automatically; tests that create no engines simply have nothing to
    dispose.
    """
    yield
    engines_to_dispose: list[object] = []
    with _tracker_lock:
        engines_to_dispose = list(_engine_tracker)
        _engine_tracker.clear()

    for engine in reversed(engines_to_dispose):
        try:
            await engine.dispose()
        except Exception:
            pass  # best-effort; loop may already be closed in extreme cases
