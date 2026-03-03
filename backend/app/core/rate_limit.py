"""Simple in-memory token-bucket rate limiter for abuse prevention.

This provides per-IP rate limiting without external dependencies.
For multi-process or distributed deployments, a Redis-based limiter
should be used instead.
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock

# Run a full sweep of all keys every 128 calls to is_allowed.
_CLEANUP_INTERVAL = 128


class InMemoryRateLimiter:
    """Token-bucket rate limiter keyed by arbitrary string (typically client IP)."""

    def __init__(self, *, max_requests: int, window_seconds: float) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._buckets: dict[str, deque[float]] = {}
        self._lock = Lock()
        self._call_count = 0

    def _sweep_expired(self, cutoff: float) -> None:
        """Remove keys whose timestamps have all expired."""
        expired_keys = [
            k for k, ts_deque in self._buckets.items()
            if not ts_deque or ts_deque[-1] <= cutoff
        ]
        for k in expired_keys:
            del self._buckets[k]

    def is_allowed(self, key: str) -> bool:
        """Return True if the request should be allowed, False if rate-limited."""
        now = time.monotonic()
        cutoff = now - self._window_seconds
        with self._lock:
            self._call_count += 1
            # Periodically sweep all keys to evict stale entries from
            # clients that have stopped making requests.
            if self._call_count % _CLEANUP_INTERVAL == 0:
                self._sweep_expired(cutoff)

            timestamps = self._buckets.get(key)
            if timestamps is None:
                timestamps = deque()
                self._buckets[key] = timestamps
            # Prune expired entries from the front (timestamps are monotonic)
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= self._max_requests:
                return False
            timestamps.append(now)
            return True


# Shared limiter instances for specific endpoints.
# Agent auth: 20 attempts per 60 seconds per IP.
agent_auth_limiter = InMemoryRateLimiter(max_requests=20, window_seconds=60.0)
# Webhook ingest: 60 requests per 60 seconds per IP.
webhook_ingest_limiter = InMemoryRateLimiter(max_requests=60, window_seconds=60.0)
