"""Amazon Marketing Stream dataset and queue configuration."""

from __future__ import annotations

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
