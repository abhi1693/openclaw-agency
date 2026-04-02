"""GET /api/v1/health — versioned health check endpoint."""

from __future__ import annotations

from datetime import datetime, timezone
from importlib.metadata import version as pkg_version, PackageNotFoundError

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


def _get_version() -> str:
    try:
        return pkg_version("openclaw-agency-backend")
    except PackageNotFoundError:
        return "unknown"


class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str


@router.get("/health", response_model=HealthResponse, summary="Versioned Health Check")
def health_v1() -> HealthResponse:
    """Return service status, version, and current UTC timestamp."""
    return HealthResponse(
        status="ok",
        version=_get_version(),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
