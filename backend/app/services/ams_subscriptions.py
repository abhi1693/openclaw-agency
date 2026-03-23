"""Amazon Marketing Stream subscription manager.

Wraps the Amazon Advertising API to create, list, and delete
stream subscriptions that push data into our SQS queues.
Delegates execution to the amazon-advertising Node.js skill
(same pattern as ads_api.py).
"""

from __future__ import annotations

from typing import Any

from app.config.ams_config import AMS_DATASETS, AMS_PROFILE_ID, ams_sqs_arn
from app.core.logging import get_logger
from app.services.ads_api import _run_ads_script

logger = get_logger(__name__)


class AMSSubscriptionManager:
    """Manage Amazon Marketing Stream subscriptions via the Ads API."""

    async def list_subscriptions(self, profile_id: str) -> list[dict[str, Any]]:
        """List all stream subscriptions for the given advertising profile."""
        result = await _run_ads_script(
            "listStreamSubscriptions",
            "--profileId", profile_id,
        )
        subscriptions: list[dict[str, Any]] = result.get("subscriptions", result if isinstance(result, list) else [])
        logger.debug("ams_subs.list profile_id=%s count=%d", profile_id, len(subscriptions))
        return subscriptions

    async def create_subscription(
        self,
        profile_id: str,
        dataset_id: str,
        sqs_arn: str,
    ) -> dict[str, Any]:
        """Create a new stream subscription pushing *dataset_id* to *sqs_arn*.

        Amazon returns a subscriptionId on success.
        """
        result = await _run_ads_script(
            "createStreamSubscription",
            "--profileId", profile_id,
            "--datasetId", dataset_id,
            "--sqsArn", sqs_arn,
        )
        logger.info(
            "ams_subs.created profile_id=%s dataset=%s sqs_arn=%s subscription_id=%s",
            profile_id, dataset_id, sqs_arn, result.get("subscriptionId"),
        )
        return result

    async def delete_subscription(self, profile_id: str, subscription_id: str) -> dict[str, Any]:
        """Delete an existing stream subscription."""
        result = await _run_ads_script(
            "deleteStreamSubscription",
            "--profileId", profile_id,
            "--subscriptionId", subscription_id,
        )
        logger.info(
            "ams_subs.deleted profile_id=%s subscription_id=%s", profile_id, subscription_id
        )
        return result


async def ensure_subscriptions(profile_id: str | None = None) -> dict[str, Any]:
    """Ensure all required AMS stream subscriptions exist.

    Reads configured datasets and their SQS ARNs from ams_config.
    Lists existing subscriptions, creates any that are missing.

    Returns a summary: { profile_id, existing, skipped, created, errors }.
    """
    mgr = AMSSubscriptionManager()
    pid = (profile_id or AMS_PROFILE_ID or "").strip()
    if not pid:
        return {
            "error": "No profile_id provided and AMAZON_ADS_PROFILE_ID is not set",
            "existing": 0,
            "created": [],
            "errors": [],
        }

    # Build required dataset → ARN map
    required: dict[str, str] = {
        ds_id: ams_sqs_arn(ds["queue_name"], ds_id)
        for ds_id, ds in AMS_DATASETS.items()
    }

    # List existing subscriptions
    try:
        existing = await mgr.list_subscriptions(pid)
    except Exception as exc:  # noqa: BLE001
        logger.error("ensure_subscriptions: list failed: %s", exc)
        return {"error": str(exc), "existing": 0, "created": [], "errors": [str(exc)]}

    existing_datasets = {s.get("dataSetId") for s in existing if s.get("dataSetId")}
    logger.info(
        "ensure_subscriptions: profile=%s existing=%d datasets=%s",
        pid, len(existing), existing_datasets,
    )

    created: list[dict[str, Any]] = []
    errors: list[str] = []
    skipped: list[str] = []

    for dataset_id, sqs_arn in required.items():
        if dataset_id in existing_datasets:
            skipped.append(dataset_id)
            continue
        if not sqs_arn or sqs_arn.endswith(":"):
            errors.append(f"{dataset_id}: no SQS ARN configured (set AMS_SQS_{dataset_id.upper().replace('-', '_')}_ARN)")
            continue
        try:
            result = await mgr.create_subscription(pid, dataset_id, sqs_arn)
            created.append({"dataset_id": dataset_id, "sqs_arn": sqs_arn, "result": result})
            logger.info("ensure_subscriptions: created %s → %s", dataset_id, result.get("subscriptionId"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{dataset_id}: {exc}")
            logger.error("ensure_subscriptions: create %s failed: %s", dataset_id, exc)

    return {
        "profile_id": pid,
        "existing": len(existing),
        "skipped": skipped,
        "created": created,
        "errors": errors,
        "message": (
            f"Created {len(created)} subscription(s). Data will start flowing within 1-2 hours."
            if created else
            "All subscriptions already active." if not errors else
            f"{len(errors)} error(s). Check SQS ARN configuration."
        ),
    }
