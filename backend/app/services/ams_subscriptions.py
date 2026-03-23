"""Amazon Marketing Stream subscription manager.

Wraps the Amazon Advertising API to create, list, and delete
stream subscriptions that push data into our SQS queues.
Delegates execution to the amazon-advertising Node.js skill
(same pattern as ads_api.py).
"""

from __future__ import annotations

from typing import Any

from app.services.ads_api import _run_ads_script
from app.core.logging import get_logger

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
