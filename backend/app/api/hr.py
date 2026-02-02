"""HR module removed.

Mission Control now uses the org/people module (employees) for provisioning.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/hr", tags=["hr"])


@router.get("/")
def hr_removed():
    return {
        "ok": False,
        "error": "HR module removed; use /employees endpoints for provisioning",
    }
