"""HTTP clients for COFIATRADING canon sources.

source_tag: NY_COFIATRADING_SOURCES_V1_20260527T1100Z
canon: Erwin 2026-05-27T12:25Z "focus New York le plus rapidement"
ban: aucun pipe Abidjan :8430

Sources canon:
- Central Brain :8767 (15 maisons SSOT)
- CofiaPublisher :8540 (88 MP4 prets canon moteur 100M)
- Stripe API direct (past_due, MRR, offers — needs STRIPE_SECRET_KEY env)
- rtk-llm-proxy :11435 (Qwen/Gemini routing — §15 LOCAL-ONLY)
"""
from __future__ import annotations

import os
import json
import sqlite3
from typing import Any
from datetime import datetime, timezone
from pathlib import Path

import httpx

# Docker on Mac: host.docker.internal reach host services
HOST = os.environ.get("COF_HOST_INTERNAL", "host.docker.internal")
CENTRAL_BRAIN_URL = f"http://{HOST}:8767"
COFIA_PUBLISHER_URL = f"http://{HOST}:8540"
RTK_LLM_PROXY_URL = f"http://{HOST}:11435"
STRIPE_API_URL = "https://api.stripe.com/v1"
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "").strip()
IRON_CRM_DB = Path(os.environ.get("COF_IRON_CRM_DB", "/cof/iron_crm_ultra_runtime.db"))
BROKER_SHARED_DIR = Path(os.environ.get("COF_BROKER_SHARED_DIR", "/cof/shared"))

DEFAULT_TIMEOUT = httpx.Timeout(connect=2.0, read=3.0, write=3.0, pool=5.0)


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _broker_rows_from_snapshot(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = _read_json(path)
    if isinstance(data, dict):
        values = list(data.values())
    elif isinstance(data, list):
        values = data
    else:
        values = []
    return [row for row in values if isinstance(row, dict)]


def _sqlite_count(table: str) -> int:
    if not IRON_CRM_DB.exists():
        return 0
    with sqlite3.connect(f"file:{IRON_CRM_DB}?mode=ro&immutable=1", uri=True) as conn:
        cursor = conn.execute(f"SELECT COUNT(*) FROM {table}")
        return int(cursor.fetchone()[0] or 0)


async def fetch_iron_summary() -> dict[str, Any]:
    """NY native read-only Iron CRM + broker summary, sans appel Abidjan :8430."""
    brokers: dict[str, Any] = {}
    ftd_cumul = 0
    commission_lifetime = 0.0
    net_dep_cumul = 0.0

    for broker_id in ["raisefx", "ironfx", "fxcess", "libertex"]:
        rows = _broker_rows_from_snapshot(BROKER_SHARED_DIR / broker_id / "snapshot_current.json")
        total = len(rows)
        ftd = sum(1 for row in rows if float(row.get("first_dep") or 0) > 0)
        commission = round(sum(float(row.get("commission") or 0) for row in rows), 2)
        net_dep = round(sum(float(row.get("net_dep") or 0) for row in rows), 2)
        brokers[broker_id] = {
            "total": total,
            "ftd": ftd,
            "commission_lifetime_usd": commission,
            "net_dep_usd": net_dep,
            "source": f"/cof/shared/{broker_id}/snapshot_current.json",
        }
        ftd_cumul += ftd
        commission_lifetime += commission
        net_dep_cumul += net_dep

    clients_active = _sqlite_count("clients")
    broker_accounts = _sqlite_count("broker_accounts")

    return {
        "ok": True,
        "source_tag": "NY_IRON_SUMMARY_READONLY_NO_ABIDJAN_20260527T1338Z",
        "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "iron_crm_db": str(IRON_CRM_DB),
        "broker_shared_dir": str(BROKER_SHARED_DIR),
        "clients_active": clients_active,
        "iron_active_clients": clients_active,
        "broker_accounts": broker_accounts,
        "ftd_cumul": ftd_cumul,
        "ftd_cumul_eur": round(net_dep_cumul * 0.93, 2),
        "net_dep_cumul_usd": round(net_dep_cumul, 2),
        "brokers_commission_lifetime_usd": round(commission_lifetime, 2),
        "brokers": brokers,
        "sources": [
            str(IRON_CRM_DB),
            str(BROKER_SHARED_DIR / "{broker}/snapshot_current.json"),
        ],
    }


async def fetch_central_brain_houses() -> dict[str, Any]:
    """Proxy Central Brain :8767/api/central-brain/houses (15 maisons SSOT)."""
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        r = await client.get(f"{CENTRAL_BRAIN_URL}/api/central-brain/houses")
        r.raise_for_status()
        return r.json()


async def fetch_publisher_status() -> dict[str, Any]:
    """Proxy CofiaPublisher :8540/api/status (canon moteur video 100M)."""
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        r = await client.get(f"{COFIA_PUBLISHER_URL}/api/status")
        r.raise_for_status()
        return r.json()


async def fetch_publisher_renders() -> dict[str, Any]:
    """Liste des renders MP4 prets publication."""
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        r = await client.get(f"{COFIA_PUBLISHER_URL}/api/renders")
        r.raise_for_status()
        return r.json()


async def fetch_stripe_past_due() -> dict[str, Any]:
    """Stripe past_due open invoices (canon §35 Sidq — vrai EUR recouvrable).

    Returns {error: "STRIPE_SECRET_KEY_required"} si clef absente (pas de fake).
    """
    if not STRIPE_SECRET_KEY:
        return {"error": "STRIPE_SECRET_KEY_required", "items": [], "total_eur": 0.0}
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        r = await client.get(
            f"{STRIPE_API_URL}/invoices",
            params={"status": "open", "limit": 100},
            headers={"Authorization": f"Bearer {STRIPE_SECRET_KEY}"},
        )
        r.raise_for_status()
        data = r.json()
        items = [
            {
                "id": inv["id"],
                "customer": inv["customer"],
                "amount_due_eur": inv["amount_due"] / 100,
                "attempt_count": inv.get("attempt_count", 0),
                "next_payment_attempt": inv.get("next_payment_attempt"),
                "hosted_invoice_url": inv.get("hosted_invoice_url"),
            }
            for inv in data.get("data", [])
        ]
        return {
            "items": items,
            "total_eur": round(sum(i["amount_due_eur"] for i in items), 2),
            "count": len(items),
        }


async def fetch_stripe_subscriptions_summary() -> dict[str, Any]:
    """Stripe active subscriptions summary (MRR canon)."""
    if not STRIPE_SECRET_KEY:
        return {"error": "STRIPE_SECRET_KEY_required", "mrr_eur": 0.0, "active_count": 0}
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        r = await client.get(
            f"{STRIPE_API_URL}/subscriptions",
            params={"status": "active", "limit": 100},
            headers={"Authorization": f"Bearer {STRIPE_SECRET_KEY}"},
        )
        r.raise_for_status()
        data = r.json()
        subs = data.get("data", [])
        mrr_cents = 0
        for sub in subs:
            for item in sub.get("items", {}).get("data", []):
                price = item.get("price", {})
                unit_amount = price.get("unit_amount") or 0
                quantity = item.get("quantity", 1)
                interval = price.get("recurring", {}).get("interval", "month")
                # Normalize to monthly
                if interval == "year":
                    mrr_cents += unit_amount * quantity // 12
                elif interval == "week":
                    mrr_cents += unit_amount * quantity * 4
                else:
                    mrr_cents += unit_amount * quantity
        return {
            "mrr_eur": round(mrr_cents / 100, 2),
            "active_count": len(subs),
        }
