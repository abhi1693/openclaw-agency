"""Interactive CLI script to set up Amazon Marketing Stream subscriptions.

Steps:
  1. Accept SQS ARNs (one per dataset or a shared one)
  2. Create AMS subscriptions via the Ads API
  3. Wait for SNS SubscriptionConfirmation messages in each queue
  4. Auto-confirm them
  5. Verify data begins flowing

Usage::

    python backend/scripts/setup_ams.py \\
        --profile-id 1234567890 \\
        --sqs-arn arn:aws:sqs:us-east-1:123456789012:zoviro-ams-sp-traffic \\
        --datasets sp-traffic sp-conversion

    # Or use individual ARNs per dataset:
    python backend/scripts/setup_ams.py \\
        --profile-id 1234567890 \\
        --dataset-arns sp-traffic=arn:aws:sqs:... sp-conversion=arn:aws:sqs:...

    # Dry-run (print plan, no API calls):
    python backend/scripts/setup_ams.py --profile-id 1234 --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import urllib.request
from pathlib import Path

# Ensure the backend package is importable when run from repo root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import aioboto3  # noqa: E402

from app.config.ams_config import AMS_DATASETS  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.logging import configure_logging, get_logger  # noqa: E402
from app.services.ams_subscriptions import AMSSubscriptionManager  # noqa: E402

configure_logging()
logger = get_logger(__name__)

CONFIRMATION_TIMEOUT_SECONDS = 120
CONFIRMATION_POLL_INTERVAL = 5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _boto_session() -> aioboto3.Session:
    kwargs: dict[str, str] = {"region_name": settings.aws_region}
    if settings.aws_access_key_id:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
    if settings.aws_secret_access_key:
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return aioboto3.Session(**kwargs)


async def _wait_for_confirmation(queue_url: str, dataset_id: str) -> bool:
    """Poll queue until an SNS SubscriptionConfirmation arrives, auto-confirm it."""
    deadline = time.monotonic() + CONFIRMATION_TIMEOUT_SECONDS
    session_obj = _boto_session()
    print(f"  Waiting for SNS confirmation on {dataset_id} ({queue_url})...")

    async with session_obj.client("sqs") as sqs:  # type: ignore[attr-defined]
        while time.monotonic() < deadline:
            resp = await sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=CONFIRMATION_POLL_INTERVAL,
            )
            for msg in resp.get("Messages", []):
                body = msg.get("Body", "")
                receipt = msg["ReceiptHandle"]
                try:
                    outer = json.loads(body)
                    if outer.get("Type") == "SubscriptionConfirmation":
                        subscribe_url = outer.get("SubscribeURL", "")
                        if subscribe_url:
                            urllib.request.urlopen(subscribe_url, timeout=10)  # noqa: S310
                            print(f"  ✓ SNS subscription confirmed for {dataset_id}")
                        await sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt)
                        return True
                except Exception as exc:  # noqa: BLE001
                    print(f"  ! Error processing message: {exc}")
            print(f"  ... still waiting for {dataset_id} ...")

    print(f"  ✗ Timeout waiting for confirmation on {dataset_id}")
    return False


def _get_queue_url(queue_name: str) -> str:
    prefix = settings.ams_sqs_prefix.rstrip("/")
    if prefix:
        return f"{prefix}/{queue_name}"
    return queue_name


# ---------------------------------------------------------------------------
# Main setup flow
# ---------------------------------------------------------------------------


async def run_setup(
    profile_id: str,
    dataset_arns: dict[str, str],
    dry_run: bool = False,
) -> None:
    mgr = AMSSubscriptionManager()

    print(f"\n{'DRY RUN — ' if dry_run else ''}AMS Setup for profile {profile_id}")
    print("=" * 60)

    # 1. List existing subscriptions
    print("\n[1/4] Fetching existing subscriptions...")
    if not dry_run:
        try:
            existing = await mgr.list_subscriptions(profile_id)
            existing_datasets = {s.get("datasetId") for s in existing}
            print(f"  Found {len(existing)} existing subscription(s): {existing_datasets or 'none'}")
        except Exception as exc:  # noqa: BLE001
            print(f"  Warning: could not list subscriptions: {exc}")
            existing_datasets: set[str] = set()
    else:
        existing_datasets = set()

    # 2. Create subscriptions
    print("\n[2/4] Creating subscriptions...")
    created: dict[str, str] = {}
    for dataset_id, sqs_arn in dataset_arns.items():
        if dataset_id not in AMS_DATASETS:
            print(f"  ✗ Unknown dataset '{dataset_id}' — skipping")
            continue
        if dataset_id in existing_datasets:
            print(f"  ~ {dataset_id}: already subscribed — skipping")
            continue
        print(f"  + {dataset_id} → {sqs_arn}")
        if not dry_run:
            try:
                result = await mgr.create_subscription(profile_id, dataset_id, sqs_arn)
                sub_id = result.get("subscriptionId", "?")
                created[dataset_id] = sub_id
                print(f"    subscription_id: {sub_id}")
            except Exception as exc:  # noqa: BLE001
                print(f"  ✗ Failed to create subscription for {dataset_id}: {exc}")

    # 3. Wait for SNS confirmation
    print("\n[3/4] Waiting for SNS subscription confirmations...")
    if dry_run:
        print("  (dry-run — skipped)")
    else:
        confirmed = 0
        for dataset_id, sqs_arn in dataset_arns.items():
            if dataset_id not in AMS_DATASETS:
                continue
            queue_name = AMS_DATASETS[dataset_id]["queue_name"]
            queue_url = _get_queue_url(queue_name)
            ok = await _wait_for_confirmation(queue_url, dataset_id)
            if ok:
                confirmed += 1
        print(f"\n  Confirmed {confirmed}/{len(dataset_arns)} queues")

    # 4. Summary
    print("\n[4/4] Setup complete")
    if dry_run:
        print("  This was a dry run — no changes were made.")
        print("  Re-run without --dry-run to apply.")
    else:
        print("  The AMS worker (mc-ams-worker) will now consume data from SQS.")
        print("  Monitor with: pm2 logs mc-ams-worker")
        print("  Check metrics: GET /api/v1/ams/status")
    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Set up Amazon Marketing Stream SQS subscriptions",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--profile-id", required=True, help="Amazon Ads profile ID")
    parser.add_argument(
        "--sqs-arn",
        help="Single SQS ARN used for all datasets (use --dataset-arns for per-dataset ARNs)",
    )
    parser.add_argument(
        "--datasets",
        nargs="+",
        default=list(AMS_DATASETS.keys()),
        help=f"Datasets to subscribe (default: all). Choices: {list(AMS_DATASETS.keys())}",
    )
    parser.add_argument(
        "--dataset-arns",
        nargs="+",
        metavar="DATASET=ARN",
        help="Per-dataset SQS ARNs in the form dataset_id=arn:...",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print plan only, no API calls")
    parser.add_argument("--region", help="AWS region (overrides AMS_SQS_PREFIX / aws_region)")

    args = parser.parse_args()

    # Build dataset → ARN map
    dataset_arns: dict[str, str] = {}

    if args.dataset_arns:
        for entry in args.dataset_arns:
            if "=" not in entry:
                print(f"Error: --dataset-arns entry must be DATASET=ARN, got: {entry}", file=sys.stderr)
                sys.exit(1)
            ds, arn = entry.split("=", 1)
            dataset_arns[ds.strip()] = arn.strip()
    elif args.sqs_arn:
        for ds in args.datasets:
            dataset_arns[ds] = args.sqs_arn
    else:
        # Interactive prompts
        print("No SQS ARN provided. Enter ARNs interactively (or Ctrl+C to quit):")
        for ds in args.datasets:
            arn = input(f"  SQS ARN for '{ds}': ").strip()
            if arn:
                dataset_arns[ds] = arn

    if not dataset_arns:
        print("Error: No dataset/ARN mappings provided.", file=sys.stderr)
        sys.exit(1)

    asyncio.run(run_setup(args.profile_id, dataset_arns, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
