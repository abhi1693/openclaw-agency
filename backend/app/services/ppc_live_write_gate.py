"""Live-write readiness gate for PPC proposal execution.

Phase 4 defines a formal readiness gate that MUST pass before FEATURE_PPC_LIVE_WRITES
can ever be set to True. The gate is implemented as a pure-read function that
summarises every blocker currently preventing live writes — giving the operator
a single view of exactly what must be resolved before any pilot can begin.

Design goals:
- Never enables live writes; only reports whether they COULD be enabled.
- Explicitly ties the gate to the feature flag.
- Hard-codes the blocking conditions so they cannot be accidentally bypassed.
- Pilot-path policy is encoded as a simple approved-proposal-type list, which
  prevents live writes from being attempted on proposal types that haven't been
  explicitly reviewed.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config.ams_config import get_ams_profile_id
from app.services.ppc_execution import FEATURE_PPC_LIVE_WRITES
from app.models.ppc_automation import PpcExecutionItem, PpcProposal


# ---------------------------------------------------------------------------
# Pilot policy — hard-coded approved types list
#
# Phase 4: "bid" is the only approved pilot type.
# Other types (keyword, placement, budget) require additional review
# before being added to this list.
# ---------------------------------------------------------------------------

PILOT_APPROVED_TYPES: list[str] = ["bid"]


def get_pilot_policy() -> dict[str, Any]:
    """Return the current pilot policy as a plain dict."""
    return {
        "approved_types": PILOT_APPROVED_TYPES,
        "message": (
            f"Live-write pilots are only approved for proposal types: {PILOT_APPROVED_TYPES}. "
            "Other types (keyword, placement, budget) require separate review and approval "
            "before they can execute live writes."
        ),
    }


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _blocker(
    category: str,
    code: str,
    message: str,
    hint: str,
    blocking: bool = True,
) -> dict[str, Any]:
    return dict(category=category, code=code, message=message, hint=hint, blocking=blocking)


# ---------------------------------------------------------------------------
# Individual blockers
# ---------------------------------------------------------------------------

async def _check_feature_flag() -> list[dict[str, Any]]:
    """Warn if the feature flag is unexpectedly True (should be False in Phase 4)."""
    if FEATURE_PPC_LIVE_WRITES:
        return [
            _blocker(
                category="feature_flag",
                code="flag_unexpectedly_true",
                message="FEATURE_PPC_LIVE_WRITES is True — live writes are globally enabled.",
                hint="Set FEATURE_PPC_LIVE_WRITES = False in ppc_execution.py to return to safe observation mode.",
                blocking=True,
            )
        ]
    return []


def _check_ads_credentials() -> list[dict[str, Any]]:
    """Check that AMAZON_ADS_PROFILE_ID env var is set."""
    blockers: list[dict[str, Any]] = []
    profile_id = get_ams_profile_id()
    if not profile_id:
        blockers.append(
            _blocker(
                category="credentials",
                code="ads_profile_id_missing",
                message="AMAZON_ADS_PROFILE_ID env var is not set.",
                hint="Set AMAZON_ADS_PROFILE_ID in the environment before enabling live writes.",
                blocking=True,
            )
        )
    return blockers


async def _check_observation_runs(session: AsyncSession) -> list[dict[str, Any]]:
    """Verify that at least one dry-run execution has completed.

    At least one execution record with status applied|skipped proves the system
    has run through the full pipeline in observation mode before any live writes
    would be attempted.
    """
    from sqlalchemy import select as sql_select
    from sqlalchemy import func as sql_func

    blockers: list[dict[str, Any]] = []

    result = await session.exec(
        sql_select(sql_func.count(PpcExecutionItem.id)).where(
            PpcExecutionItem.status.in_(["skipped", "applied"])
        )
    )
    count_row = result.one()
    execution_count: int = count_row[0] if count_row else 0

    if execution_count == 0:
        blockers.append(
            _blocker(
                category="observation_runs",
                code="no_observation_runs",
                message=(
                    "No proposal execution runs have completed yet. "
                    "Before enabling live writes, at least one observation run "
                    "(dry-run with FEATURE_PPC_LIVE_WRITES=False) must complete."
                ),
                hint="Execute at least one approved proposal end-to-end in dry-run mode to confirm the pipeline.",
                blocking=True,
            )
        )
    return blockers


async def _check_pilot_approval(session: AsyncSession) -> list[dict[str, Any]]:
    """Verify that at least one proposal has been approved by the operator."""
    from sqlalchemy import select as sql_select
    from sqlalchemy import func as sql_func

    blockers: list[dict[str, Any]] = []

    result = await session.exec(
        sql_select(sql_func.count()).select_from(PpcProposal).where(PpcProposal.status == "approved")
    )
    count_row = result.one()
    approved_count: int = count_row[0] if count_row else 0

    if approved_count == 0:
        blockers.append(
            _blocker(
                category="pilot_policy",
                code="no_approved_proposals",
                message=(
                    "No proposals have been approved yet. "
                    "At least one proposal must be reviewed and approved before a pilot can begin."
                ),
                hint="Create, review, and approve a proposal using the /ppc/automation/proposals endpoints.",
                blocking=True,
            )
        )
    return blockers


# ---------------------------------------------------------------------------
# Main gate
# ---------------------------------------------------------------------------

async def get_live_write_gate(
    session: AsyncSession,
    checked_at: str,
) -> dict[str, Any]:
    """Evaluate all readiness checkers and return a structured gate report.

    This function never modifies any data — it is a pure read-only diagnostic.
    It is safe to call at any time, including in the observation period when
    FEATURE_PPC_LIVE_WRITES=False.

    Returns a dict matching LiveWriteGateReport schema.
    """
    all_blockers: list[dict[str, Any]] = []

    # Run all checkers
    all_blockers.extend(_check_ads_credentials())
    all_blockers.extend(await _check_feature_flag())
    all_blockers.extend(await _check_pilot_approval(session))
    all_blockers.extend(await _check_observation_runs(session))

    blocking_blockers = [b for b in all_blockers if b["blocking"]]

    blockers_summary: dict[str, int] = {}
    for b in all_blockers:
        cat_key = b["category"]
        blockers_summary[cat_key] = blockers_summary.get(cat_key, 0) + 1

    return {
        "enabled": FEATURE_PPC_LIVE_WRITES,
        "can_enable": len(blocking_blockers) == 0,
        "blockers": all_blockers,
        "blockers_summary": blockers_summary,
        "pilot_policy": get_pilot_policy(),
        "feature_flag_value": FEATURE_PPC_LIVE_WRITES,
        "ads_profile_id": get_ams_profile_id(),
        "checked_at": checked_at,
    }