"""Amazon Marketing Stream dataset and queue configuration."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Ensure .env is loaded into os.environ (pydantic-settings doesn't always do this)
_env_path = Path(__file__).resolve().parents[2] / ".env"
if _env_path.exists():
    load_dotenv(_env_path, override=False)

# Datasets published by Amazon Marketing Stream.
# queue_name is the short name; full URL is constructed from AMS_SQS_PREFIX in settings.
AMS_DATASETS: dict[str, dict[str, str]] = {
    "sp-traffic": {
        "description": "Sponsored Products traffic (impressions, clicks)",
        "queue_name": "zoviro-ams-sp-traffic",
    },
    "sp-conversion": {
        "description": "Sponsored Products conversions (orders, sales)",
        "queue_name": "zoviro-ams-sp-conversion",
    },
    "budget-usage": {
        "description": "Campaign budget usage",
        "queue_name": "zoviro-ams-budget-usage",
    },
    "campaigns": {
        "description": "Campaign state changes",
        "queue_name": "zoviro-ams-campaigns",
    },
}

# Which datasets feed into hourly_campaign_metrics
METRIC_DATASETS = {"sp-traffic", "sp-conversion"}

# SQS receive settings
SQS_WAIT_TIME_SECONDS = 20  # long-poll
SQS_MAX_MESSAGES = 10       # per poll
SQS_MAX_FAILURES = 3        # before treating message as dead-letter

# SQS ARN construction — prefer per-dataset env vars; fall back to prefix + queue_name
_AMS_SQS_REGION  = os.environ.get("AMS_SQS_REGION", "us-east-1")
_AMS_SQS_ACCOUNT = os.environ.get("AWS_ACCOUNT_ID", "")
AMS_SQS_ARN_PREFIX = f"arn:aws:sqs:{_AMS_SQS_REGION}:{_AMS_SQS_ACCOUNT}"


def ams_sqs_arn(queue_name: str, dataset_id: str = "") -> str:
    """Return the SQS ARN for a dataset queue.

    Checks AMS_SQS_<DATASET>_ARN env var first (e.g. AMS_SQS_SP_TRAFFIC_ARN),
    then falls back to {AMS_SQS_ARN_PREFIX}:{queue_name}.
    """
    if dataset_id:
        env_key = "AMS_SQS_" + dataset_id.upper().replace("-", "_") + "_ARN"
        explicit = os.environ.get(env_key, "").strip()
        if explicit:
            return explicit
    return f"{AMS_SQS_ARN_PREFIX}:{queue_name}"


# Amazon Advertising profile ID (used for AMS subscription management)
# Use a function — .env may not be loaded yet at module import time
def get_ams_profile_id() -> str:
    return os.environ.get("AMAZON_ADS_PROFILE_ID", "")
