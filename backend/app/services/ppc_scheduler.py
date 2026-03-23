"""PPC Automation Scheduler — Phase 2.

Orchestrates daily bid optimization + keyword discovery runs.
Can be triggered manually via API or by an external cron job.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.services.bid_optimizer import generate_bid_recommendations
from app.services.keyword_discoverer import generate_keyword_recommendations

logger = get_logger(__name__)


async def run_optimizer(
    session: AsyncSession,
    parent_asin: str | None = None,
    run_bid: bool = True,
    run_keywords: bool = True,
) -> dict[str, Any]:
    """Run bid optimization and/or keyword discovery.

    Args:
        session: async DB session
        parent_asin: if set, scope bid optimization to this product's settings
        run_bid: whether to run the bid optimizer
        run_keywords: whether to run keyword discovery

    Returns:
        Summary dict with counts and timing.
    """
    started_at = datetime.utcnow()
    result: dict[str, Any] = {
        "started_at": started_at.isoformat(),
        "parent_asin": parent_asin,
        "bid_recommendations_created": 0,
        "keyword_recommendations_created": 0,
        "errors": [],
    }

    if run_bid:
        try:
            bid_recs = await generate_bid_recommendations(session, parent_asin=parent_asin)
            result["bid_recommendations_created"] = len(bid_recs)
            logger.info("ppc_scheduler: bid optimizer done, %d recs", len(bid_recs))
        except Exception as exc:  # noqa: BLE001
            logger.exception("ppc_scheduler: bid optimizer failed")
            result["errors"].append({"step": "bid_optimizer", "error": str(exc)})

    if run_keywords:
        try:
            kw_recs = await generate_keyword_recommendations(session)
            result["keyword_recommendations_created"] = len(kw_recs)
            logger.info("ppc_scheduler: keyword discoverer done, %d recs", len(kw_recs))
        except Exception as exc:  # noqa: BLE001
            logger.exception("ppc_scheduler: keyword discoverer failed")
            result["errors"].append({"step": "keyword_discoverer", "error": str(exc)})

    finished_at = datetime.utcnow()
    result["finished_at"] = finished_at.isoformat()
    result["duration_seconds"] = (finished_at - started_at).total_seconds()
    return result
