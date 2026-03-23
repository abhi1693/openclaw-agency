"""Amazon Marketing Stream SQS consumer.

Connects to configured SQS queues, long-polls for messages, maps AMS JSON
payloads into HourlyCampaignMetric rows (upsert), and deletes processed
messages.  SNS subscription confirmation messages are auto-confirmed.
"""

from __future__ import annotations

import asyncio
import json
import urllib.request
from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime
from decimal import Decimal
from typing import Any

import aioboto3
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config.ams_config import (
    AMS_DATASETS,
    METRIC_DATASETS,
    SQS_MAX_FAILURES,
    SQS_MAX_MESSAGES,
    SQS_WAIT_TIME_SECONDS,
)
from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import HourlyCampaignMetric

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Stats tracking (in-process singleton, reset on worker restart)
# ---------------------------------------------------------------------------


@dataclass
class ConsumerStats:
    messages_processed: int = 0
    messages_failed: int = 0
    messages_dead_lettered: int = 0
    last_poll_at: datetime | None = None
    last_error: str | None = None
    queue_stats: dict[str, dict[str, Any]] = field(default_factory=dict)

    def record_poll(self, queue_name: str, processed: int, failed: int) -> None:
        self.last_poll_at = utcnow()
        self.messages_processed += processed
        self.messages_failed += failed
        q = self.queue_stats.setdefault(queue_name, {"processed": 0, "failed": 0})
        q["processed"] += processed
        q["failed"] += failed

    def to_dict(self) -> dict[str, Any]:
        return {
            "messages_processed": self.messages_processed,
            "messages_failed": self.messages_failed,
            "messages_dead_lettered": self.messages_dead_lettered,
            "last_poll_at": self.last_poll_at.isoformat() if self.last_poll_at else None,
            "last_error": self.last_error,
            "queue_stats": self.queue_stats,
        }


# Global stats instance — read by the /ams/status endpoint
CONSUMER_STATS = ConsumerStats()


# ---------------------------------------------------------------------------
# Message parsing helpers
# ---------------------------------------------------------------------------


def _unwrap_sns_body(raw_body: str) -> dict[str, Any]:
    """Unwrap SNS notification wrapper if present, else parse directly."""
    outer: dict[str, Any] = json.loads(raw_body)
    # SNS wraps with "Type" / "Message" keys
    if outer.get("Type") == "Notification":
        return json.loads(outer["Message"])
    return outer


def _is_sns_subscription_confirmation(raw_body: str) -> tuple[bool, str]:
    """Return (True, SubscribeURL) if this is an SNS subscription confirmation."""
    try:
        outer: dict[str, Any] = json.loads(raw_body)
        if outer.get("Type") == "SubscriptionConfirmation":
            return True, str(outer.get("SubscribeURL", ""))
    except Exception:  # noqa: BLE001
        pass
    return False, ""


def _parse_metric_record(payload: dict[str, Any], dataset_id: str) -> HourlyCampaignMetric | None:
    """Map a raw AMS payload dict to a HourlyCampaignMetric.  Returns None if unparseable.

    AMS sp-traffic/sp-conversion payloads use snake_case keys:
      time_window_start, campaign_id, ad_group_id, keyword_id,
      placement, impressions, clicks, cost, match_type
    """
    try:
        # Parse date + hour from time_window_start (ISO: "2026-03-23T17:00:00Z")
        # Fallback to legacy "date"/"eventDate" keys
        time_start = payload.get("time_window_start")
        if time_start:
            dt = datetime.fromisoformat(str(time_start).replace("Z", "+00:00"))
            report_date = dt.date()
            hour = dt.hour
        else:
            raw_date = payload.get("date") or payload.get("eventDate")
            if not raw_date:
                return None
            report_date = date_type.fromisoformat(str(raw_date))
            hour = int(payload.get("hour", 0))

        # AMS uses snake_case; legacy uses camelCase
        campaign_id = str(
            payload.get("campaign_id") or payload.get("campaignId") or ""
        )
        if not campaign_id:
            return None

        metric = HourlyCampaignMetric(
            campaign_id=campaign_id,
            ad_group_id=str(payload.get("ad_group_id") or payload.get("adGroupId") or ""),
            keyword_id=str(payload.get("keyword_id") or payload.get("keywordId") or ""),
            match_type=payload.get("match_type") or payload.get("matchType"),
            report_date=report_date,
            hour=hour,
            impressions=int(payload.get("impressions", 0)),
            clicks=int(payload.get("clicks", 0)),
            orders=int(payload.get("orders", 0)),
            cost=Decimal(str(payload.get("cost", "0"))),
            sales=Decimal(str(payload.get("sales", "0"))),
        )
        return metric
    except Exception as exc:  # noqa: BLE001
        logger.warning("ams_consumer.parse_failed dataset=%s error=%s payload=%r", dataset_id, exc, payload)
        return None


# ---------------------------------------------------------------------------
# DB upsert
# ---------------------------------------------------------------------------


async def _upsert_metric(session: AsyncSession, incoming: HourlyCampaignMetric) -> None:
    """Select-then-insert-or-update a single HourlyCampaignMetric row."""
    stmt = select(HourlyCampaignMetric).where(
        HourlyCampaignMetric.campaign_id == incoming.campaign_id,
        col(HourlyCampaignMetric.keyword_id) == incoming.keyword_id,
        HourlyCampaignMetric.report_date == incoming.report_date,
        HourlyCampaignMetric.hour == incoming.hour,
    )
    result = await session.exec(stmt)
    existing = result.first()

    if existing is None:
        session.add(incoming)
    else:
        # Accumulate — AMS may send partial updates for the same slot
        existing.impressions += incoming.impressions
        existing.clicks += incoming.clicks
        existing.orders += incoming.orders
        existing.cost += incoming.cost
        existing.sales += incoming.sales
        # Update nullable context fields only if incoming has them
        if incoming.ad_group_id and not existing.ad_group_id:
            existing.ad_group_id = incoming.ad_group_id
        if incoming.match_type and not existing.match_type:
            existing.match_type = incoming.match_type


# ---------------------------------------------------------------------------
# Main consumer class
# ---------------------------------------------------------------------------


class AMSConsumer:
    """Async SQS consumer for Amazon Marketing Stream.

    Usage::

        consumer = AMSConsumer(session_factory)
        await consumer.poll_all()          # one round of all queues
        # or drive from the worker loop
    """

    def __init__(self, session_factory: Any) -> None:
        self._session_factory = session_factory
        self._failure_counts: dict[str, int] = {}

    def _get_queue_url(self, queue_name: str) -> str:
        from app.core.config import settings

        prefix = settings.ams_sqs_prefix.rstrip("/")
        if prefix:
            return f"{prefix}/{queue_name}"
        return queue_name

    def _get_boto_kwargs(self) -> dict[str, Any]:
        from app.core.config import settings

        kwargs: dict[str, Any] = {"region_name": settings.aws_region}
        if settings.aws_access_key_id:
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
        if settings.aws_secret_access_key:
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        return kwargs

    async def poll_queue(self, dataset_id: str, queue_name: str) -> tuple[int, int]:
        """Poll one queue, upsert metrics, delete processed messages.

        Returns (processed_count, failed_count).
        """
        queue_url = self._get_queue_url(queue_name)
        processed = 0
        failed = 0

        try:
            session_obj = aioboto3.Session(**self._get_boto_kwargs())
            async with session_obj.client("sqs") as sqs:  # type: ignore[attr-defined]
                response = await sqs.receive_message(
                    QueueUrl=queue_url,
                    MaxNumberOfMessages=SQS_MAX_MESSAGES,
                    WaitTimeSeconds=SQS_WAIT_TIME_SECONDS,
                    AttributeNames=["ApproximateReceiveCount"],
                )
                messages = response.get("Messages", [])
                if not messages:
                    return 0, 0

                to_delete: list[dict[str, str]] = []

                async with self._session_factory() as db_session:
                    for msg in messages:
                        receipt = msg["ReceiptHandle"]
                        body = msg.get("Body", "")
                        msg_id = msg.get("MessageId", "?")

                        # --- SNS subscription confirmation ---
                        is_sub_confirm, subscribe_url = _is_sns_subscription_confirmation(body)
                        if is_sub_confirm:
                            if subscribe_url:
                                try:
                                    # Auto-confirm by visiting URL (synchronous OK; once per setup)
                                    urllib.request.urlopen(subscribe_url, timeout=10)  # noqa: S310
                                    logger.info("ams_consumer.sns_confirmed dataset=%s", dataset_id)
                                except Exception as exc:  # noqa: BLE001
                                    logger.warning("ams_consumer.sns_confirm_failed url=%s err=%s", subscribe_url, exc)
                            to_delete.append({"Id": msg_id, "ReceiptHandle": receipt})
                            continue

                        # --- Normal AMS data message ---
                        if dataset_id not in METRIC_DATASETS:
                            # Non-metric dataset (budget-usage, campaigns) — ack and skip for now
                            to_delete.append({"Id": msg_id, "ReceiptHandle": receipt})
                            processed += 1
                            continue

                        try:
                            payload = _unwrap_sns_body(body)
                            # AMS may batch multiple records in "records" array or send one
                            records = payload if isinstance(payload, list) else payload.get("records", [payload])
                            for record in records:
                                metric = _parse_metric_record(record, dataset_id)
                                if metric:
                                    await _upsert_metric(db_session, metric)

                            await db_session.commit()
                            to_delete.append({"Id": msg_id, "ReceiptHandle": receipt})
                            processed += 1
                            self._failure_counts.pop(msg_id, None)

                        except Exception as exc:  # noqa: BLE001
                            await db_session.rollback()
                            count = self._failure_counts.get(msg_id, 0) + 1
                            self._failure_counts[msg_id] = count
                            logger.error(
                                "ams_consumer.msg_failed dataset=%s msg_id=%s attempt=%d err=%s",
                                dataset_id, msg_id, count, exc,
                            )
                            if count >= SQS_MAX_FAILURES:
                                logger.error(
                                    "ams_consumer.dead_letter dataset=%s msg_id=%s", dataset_id, msg_id
                                )
                                to_delete.append({"Id": msg_id, "ReceiptHandle": receipt})
                                CONSUMER_STATS.messages_dead_lettered += 1
                                self._failure_counts.pop(msg_id, None)
                            failed += 1

                # Batch-delete all processed/dead-lettered messages
                if to_delete:
                    await sqs.delete_message_batch(QueueUrl=queue_url, Entries=to_delete)

        except Exception as exc:  # noqa: BLE001
            CONSUMER_STATS.last_error = str(exc)
            logger.warning("ams_consumer.queue_unavailable dataset=%s queue=%s err=%s", dataset_id, queue_url, exc)

        return processed, failed

    async def poll_all(self) -> None:
        """Poll every configured dataset queue in sequence."""
        for dataset_id, info in AMS_DATASETS.items():
            processed, failed = await self.poll_queue(dataset_id, info["queue_name"])
            CONSUMER_STATS.record_poll(info["queue_name"], processed, failed)
            if processed or failed:
                logger.info(
                    "ams_consumer.poll_done dataset=%s processed=%d failed=%d",
                    dataset_id, processed, failed,
                )
