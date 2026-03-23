"""Amazon Ads API v3 wrapper — reads via Node.js skill subprocess, writes gated by approval flow."""

from __future__ import annotations

import asyncio
import json
import shlex
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import PpcChangeLog

ADS_API_SCRIPT = Path.home() / ".openclaw" / "skills" / "amazon-advertising" / "index.js"

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _clean_json_stdout(stdout: str) -> str:
    return "\n".join(
        line
        for line in stdout.splitlines()
        if line.strip() and not line.startswith("[dotenv") and not line.startswith("[Auth]")
    )


async def _run_ads_script(*args: str) -> dict[str, Any]:
    command = ["node", str(ADS_API_SCRIPT), *args]
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"ads-api script failed ({proc.returncode}) for {shlex.join(command)}: "
            f"{stderr.decode().strip()}"
        )
    return json.loads(_clean_json_stdout(stdout.decode()))


# ---------------------------------------------------------------------------
# Main wrapper class
# ---------------------------------------------------------------------------


class AmazonAdsAPI:
    """Thin async wrapper around the amazon-advertising Node.js skill.

    Read methods delegate to the subprocess and return parsed JSON.
    Write methods validate inputs, log to ppc_change_log, execute the API
    call, then return the result — all writes require an AsyncSession so the
    audit entry is persisted atomically.
    """

    # ── Read methods ──────────────────────────────────────────────────────

    async def get_campaigns(self, ad_type: str = "sp") -> list[dict[str, Any]]:
        """Return all campaigns for the given ad type (sp/sb/sd/sbv)."""
        result = await _run_ads_script("getCampaigns", "--adType", ad_type)
        campaigns: list[dict[str, Any]] = result.get("campaigns", result if isinstance(result, list) else [])
        logger.debug("ads_api.get_campaigns ad_type=%s count=%d", ad_type, len(campaigns))
        return campaigns

    async def get_ad_groups(self, campaign_id: str) -> list[dict[str, Any]]:
        """Return ad groups for a specific campaign."""
        result = await _run_ads_script("getAdGroups", "--campaignId", campaign_id)
        ad_groups: list[dict[str, Any]] = result.get("adGroups", result if isinstance(result, list) else [])
        logger.debug("ads_api.get_ad_groups campaign_id=%s count=%d", campaign_id, len(ad_groups))
        return ad_groups

    async def get_keywords(self, ad_group_id: str) -> list[dict[str, Any]]:
        """Return keywords for a specific ad group."""
        result = await _run_ads_script("getKeywords", "--adGroupId", ad_group_id)
        keywords: list[dict[str, Any]] = result.get("keywords", result if isinstance(result, list) else [])
        logger.debug("ads_api.get_keywords ad_group_id=%s count=%d", ad_group_id, len(keywords))
        return keywords

    async def get_campaign_report(
        self,
        campaign_id: str,
        report_date: date,
        ad_type: str = "sp",
        metrics: list[str] | None = None,
    ) -> dict[str, Any]:
        """Fetch a campaign-level performance report for a given date."""
        default_metrics = ["impressions", "clicks", "cost", "sales", "orders", "acos", "roas"]
        chosen_metrics = ",".join(metrics or default_metrics)
        result = await _run_ads_script(
            "getCampaignReport",
            "--campaignId", campaign_id,
            "--date", report_date.isoformat(),
            "--adType", ad_type,
            "--metrics", chosen_metrics,
        )
        logger.debug("ads_api.get_campaign_report campaign_id=%s date=%s", campaign_id, report_date)
        return result

    # ── Write methods (all gated — require AsyncSession for audit log) ───

    async def update_keyword_bid(
        self,
        *,
        keyword_id: str,
        campaign_id: str,
        ad_group_id: str,
        old_bid: Decimal,
        new_bid: Decimal,
        reason: str,
        triggered_by: str = "system",
        session: AsyncSession,
    ) -> dict[str, Any]:
        """Update a keyword bid.  Validates range, writes audit log, calls API."""
        if new_bid <= Decimal("0"):
            raise ValueError(f"new_bid must be positive, got {new_bid}")

        log_entry = PpcChangeLog(
            change_type="bid",
            entity_type="keyword",
            entity_id=keyword_id,
            old_value=str(old_bid),
            new_value=str(new_bid),
            reason=reason,
            triggered_by=triggered_by,
            created_at=utcnow(),
        )
        session.add(log_entry)
        await session.flush()

        result = await _run_ads_script(
            "updateKeywordBid",
            "--keywordId", keyword_id,
            "--bid", str(new_bid),
        )
        logger.info(
            "ads_api.update_keyword_bid keyword_id=%s %s→%s reason=%r",
            keyword_id, old_bid, new_bid, reason,
        )
        return result

    async def create_keyword(
        self,
        *,
        campaign_id: str,
        ad_group_id: str,
        keyword_text: str,
        match_type: str,
        bid: Decimal,
        reason: str,
        triggered_by: str = "system",
        session: AsyncSession,
    ) -> dict[str, Any]:
        """Add a new keyword to an ad group."""
        if match_type not in {"broad", "phrase", "exact"}:
            raise ValueError(f"Invalid match_type: {match_type}")

        log_entry = PpcChangeLog(
            change_type="keyword",
            entity_type="ad_group",
            entity_id=ad_group_id,
            old_value=None,
            new_value=json.dumps({"keyword": keyword_text, "matchType": match_type, "bid": str(bid)}),
            reason=reason,
            triggered_by=triggered_by,
            created_at=utcnow(),
        )
        session.add(log_entry)
        await session.flush()

        result = await _run_ads_script(
            "createKeyword",
            "--campaignId", campaign_id,
            "--adGroupId", ad_group_id,
            "--keyword", keyword_text,
            "--matchType", match_type,
            "--bid", str(bid),
        )
        logger.info(
            "ads_api.create_keyword ad_group_id=%s keyword=%r match=%s bid=%s",
            ad_group_id, keyword_text, match_type, bid,
        )
        return result

    async def create_negative_keyword(
        self,
        *,
        campaign_id: str,
        ad_group_id: str | None,
        keyword_text: str,
        match_type: str,
        reason: str,
        triggered_by: str = "system",
        session: AsyncSession,
    ) -> dict[str, Any]:
        """Add a campaign- or ad-group-level negative keyword."""
        if match_type not in {"negativeExact", "negativePhrase"}:
            raise ValueError(f"Invalid negative match_type: {match_type}")

        entity_id = ad_group_id or campaign_id
        entity_type = "ad_group" if ad_group_id else "campaign"

        log_entry = PpcChangeLog(
            change_type="negative",
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=None,
            new_value=json.dumps({"keyword": keyword_text, "matchType": match_type}),
            reason=reason,
            triggered_by=triggered_by,
            created_at=utcnow(),
        )
        session.add(log_entry)
        await session.flush()

        args = [
            "createNegativeKeyword",
            "--campaignId", campaign_id,
            "--keyword", keyword_text,
            "--matchType", match_type,
        ]
        if ad_group_id:
            args += ["--adGroupId", ad_group_id]

        result = await _run_ads_script(*args)
        logger.info(
            "ads_api.create_negative_keyword entity=%s/%s keyword=%r match=%s",
            entity_type, entity_id, keyword_text, match_type,
        )
        return result

    async def update_campaign_budget(
        self,
        *,
        campaign_id: str,
        old_budget: Decimal,
        new_budget: Decimal,
        reason: str,
        triggered_by: str = "system",
        session: AsyncSession,
    ) -> dict[str, Any]:
        """Update daily campaign budget."""
        if new_budget <= Decimal("0"):
            raise ValueError(f"new_budget must be positive, got {new_budget}")

        log_entry = PpcChangeLog(
            change_type="budget",
            entity_type="campaign",
            entity_id=campaign_id,
            old_value=str(old_budget),
            new_value=str(new_budget),
            reason=reason,
            triggered_by=triggered_by,
            created_at=utcnow(),
        )
        session.add(log_entry)
        await session.flush()

        result = await _run_ads_script(
            "updateCampaignBudget",
            "--campaignId", campaign_id,
            "--budget", str(new_budget),
        )
        logger.info(
            "ads_api.update_campaign_budget campaign_id=%s %s→%s reason=%r",
            campaign_id, old_budget, new_budget, reason,
        )
        return result
