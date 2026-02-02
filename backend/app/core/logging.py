from __future__ import annotations

import logging
import os
import sys
from typing import Any


def _level() -> str:
    return (os.environ.get("LOG_LEVEL") or os.environ.get("UVICORN_LOG_LEVEL") or "INFO").upper()


def configure_logging() -> None:
    """Configure app logging to stream to stdout.

    Uvicorn already logs requests, but we want our app/integrations logs to be visible
    in the same console stream.
    """

    level = getattr(logging, _level(), logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    # Avoid duplicate handlers (e.g., when autoreload imports twice)
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%SZ",
        )
        handler.setFormatter(formatter)
        root.addHandler(handler)

    # Make common noisy loggers respect our level
    for name in [
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "httpx",
        "requests",
    ]:
        logging.getLogger(name).setLevel(level)

    # Hide SQLAlchemy engine chatter unless explicitly debugging.
    # (You can still enable it by setting LOG_LEVEL=DEBUG and adjusting this.)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.dialects").setLevel(logging.WARNING)


def log_kv(logger: logging.Logger, msg: str, **kv: Any) -> None:
    # Lightweight key-value logging without requiring JSON logging.
    if kv:
        suffix = " ".join(f"{k}={v!r}" for k, v in kv.items())
        logger.info(f"{msg} | {suffix}")
    else:
        logger.info(msg)
