"""Retry helpers for Amazon Ads API calls.

Provides:
- Transient error classification (429 rate-limit, 5xx server errors)
- Exponential backoff with jitter for retryable errors
- Configurable per-call retry limits
- Decorator-based retry for async functions
"""

from __future__ import annotations

import asyncio
import random
from functools import wraps
from typing import Any, Callable, TypeVar

from app.core.logging import get_logger

logger = get_logger(__name__)

_T = TypeVar("_T")

# Errors that are safe to retry after a backoff
_TRANSIENT_ADS_ERROR_CODES = (
    "429",
    "503",
    "502",
    "504",
)

# Errors that indicate a permanent failure — never retry
_NON_RETRYABLE_MESSAGES = (
    "unauthorized",
    "forbidden",
    "invalid",
    "not found",
    "expired",
    "authentication",
)


def is_transient_ads_error(exc: Exception) -> bool:
    """Return True if the exception represents a transient Ads API error worth retrying."""
    msg = str(exc).lower()
    if not msg:
        return False
    # Permanently fail on auth/invalid errors
    if any(marker in msg for marker in _NON_RETRYABLE_MESSAGES):
        return False
    # Retry on rate-limit or server errors
    return any(code in msg for code in _TRANSIENT_ADS_ERROR_CODES)


def classify_error(exc: Exception) -> str:
    """Return 'transient', 'permanent', or 'unknown' for logging/debugging."""
    if is_transient_ads_error(exc):
        return "transient"
    msg = str(exc).lower()
    if any(m in msg for m in _NON_RETRYABLE_MESSAGES):
        return "permanent"
    return "unknown"


class AdsBackoff:
    """Exponential backoff with jitter for Ads API calls."""

    def __init__(
        self,
        *,
        base_delay: float = 1.0,
        max_delay: float = 32.0,
        jitter: float = 0.25,
        max_attempts: int = 3,
    ) -> None:
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter = jitter
        self.max_attempts = max_attempts
        self._delay = base_delay

    def reset(self) -> None:
        self._delay = self.base_delay

    async def run(self, fn: Callable[..., Any]) -> Any:
        """Execute fn with retry-on-transient-error policy."""
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                result = await fn()
                self.reset()
                return result
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                error_class = classify_error(exc)
                if error_class == "permanent":
                    logger.warning(
                        "AdsBackoff permanent error (attempt %d/%d): %s",
                        attempt,
                        self.max_attempts,
                        exc,
                    )
                    raise
                if attempt == self.max_attempts:
                    logger.error(
                        "AdsBackoff exhausted retries (attempt %d/%d): %s",
                        attempt,
                        self.max_attempts,
                        exc,
                    )
                    raise
                # Transient — sleep and retry
                delay = min(self._delay, self.max_delay)
                if self.jitter:
                    delay *= 1.0 + random.uniform(-self.jitter, self.jitter)
                delay = max(0.0, delay)
                logger.debug(
                    "AdsBackoff transient error, retrying in %.2fs (attempt %d/%d): %s",
                    delay,
                    attempt,
                    self.max_attempts,
                    exc,
                )
                await asyncio.sleep(delay)
                self._delay = min(self._delay * 2.0, self.max_delay)

        # Should not reach here, but satisfies type checker
        if last_error is not None:
            raise last_error
        raise RuntimeError("AdsBackoff.run reached unreachable state")


def with_ads_retry(
    base_delay: float = 1.0,
    max_delay: float = 32.0,
    jitter: float = 0.25,
    max_attempts: int = 3,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator that wraps an async Ads API call with exponential-backoff retry."""

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            backoff = AdsBackoff(
                base_delay=base_delay,
                max_delay=max_delay,
                jitter=jitter,
                max_attempts=max_attempts,
            )
            return await backoff.run(lambda: fn(*args, **kwargs))

        return wrapper

    return decorator
