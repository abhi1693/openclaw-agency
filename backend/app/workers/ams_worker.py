"""Amazon Marketing Stream background worker.

Runs as a standalone process that continuously polls SQS queues and
feeds data into hourly_campaign_metrics.

Usage::

    # standalone (via PM2 or directly):
    python -m app.workers.ams_worker

    # dry-run (one poll cycle, no loop):
    python -m app.workers.ams_worker --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import signal
import sys
from typing import Any

from app.core.logging import configure_logging, get_logger

configure_logging()
logger = get_logger(__name__)

# Poll interval between rounds (seconds) — SQS long-poll is 20s per queue,
# so this is extra rest time between full rounds.
POLL_INTERVAL_SECONDS = 5

_shutdown = asyncio.Event()


def _handle_sigterm(*_: Any) -> None:
    logger.info("ams_worker.sigterm_received — shutting down gracefully")
    _shutdown.set()


async def run_worker(dry_run: bool = False) -> None:
    """Main worker loop.  Polls all AMS queues until SIGTERM is received."""
    from app.db.session import async_session_maker
    from app.services.ams_consumer import AMSConsumer

    consumer = AMSConsumer(session_factory=async_session_maker)

    logger.info("ams_worker.started dry_run=%s", dry_run)

    if dry_run:
        logger.info("ams_worker.dry_run — performing single poll cycle")
        await consumer.poll_all()
        logger.info("ams_worker.dry_run_complete stats=%s", consumer.__class__.__name__)
        return

    while not _shutdown.is_set():
        try:
            await consumer.poll_all()
        except Exception as exc:  # noqa: BLE001
            logger.error("ams_worker.poll_error err=%s", exc, exc_info=True)

        try:
            await asyncio.wait_for(_shutdown.wait(), timeout=POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            pass

    logger.info("ams_worker.stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="AMS SQS consumer worker")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run one poll cycle and exit (for testing)",
    )
    args = parser.parse_args()

    # Register signal handlers for graceful shutdown
    loop = asyncio.new_event_loop()
    loop.add_signal_handler(signal.SIGTERM, _handle_sigterm)
    loop.add_signal_handler(signal.SIGINT, _handle_sigterm)

    try:
        loop.run_until_complete(run_worker(dry_run=args.dry_run))
    finally:
        loop.close()


if __name__ == "__main__":
    sys.exit(main())  # type: ignore[func-returns-value]
