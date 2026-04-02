"""GET /api/v1/health — versioned health check endpoint."""

from __future__ import annotations

import socket
import time
from datetime import datetime, timezone
from importlib.metadata import version as pkg_version, PackageNotFoundError

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])

_start_time = time.time()


def _get_version() -> str:
    try:
        return pkg_version("openclaw-agency-backend")
    except PackageNotFoundError:
        return "unknown"


class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str
    uptime_seconds: int
    hostname: str


@router.get("/health", response_model=HealthResponse, summary="Versioned Health Check")
def health_v1() -> HealthResponse:
    """Return service status, version, current UTC timestamp, and uptime."""
    return HealthResponse(
        status="ok",
        version=_get_version(),
        timestamp=datetime.now(timezone.utc).isoformat(),
        uptime_seconds=int(time.time() - _start_time),
        hostname=socket.gethostname(),
    )
