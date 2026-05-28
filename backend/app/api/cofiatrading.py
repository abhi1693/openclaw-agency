"""COFIATRADING domain routes — NY cockpit canon Erwin 2026-05-27T12:25Z.

source_tag: NY_COFIATRADING_ROUTES_V1_20260527T1100Z
ban: aucun pipe Abidjan :8430
prefix: /api/v1/cof/*
"""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.services.cofiatrading.sources import (
    fetch_central_brain_houses,
    fetch_iron_summary,
    fetch_publisher_renders,
    fetch_publisher_status,
    fetch_stripe_past_due,
    fetch_stripe_subscriptions_summary,
)

router = APIRouter(prefix="/cof", tags=["cofiatrading"])


@router.get("/health", summary="COFIATRADING domain health (canon sources status)")
async def cof_health() -> dict[str, Any]:
    """Cascade ping aux sources canon; rapporte chaque source live/down sans fake-green §35."""
    from app.services.cofiatrading import sources as src

    payload: dict[str, Any] = {"ok": True, "sources": {}}
    # Central Brain
    try:
        await fetch_central_brain_houses()
        payload["sources"]["central_brain"] = "live"
    except Exception as e:
        payload["sources"]["central_brain"] = f"down: {type(e).__name__}"
        payload["ok"] = False
    # CofiaPublisher
    try:
        await fetch_publisher_status()
        payload["sources"]["publisher"] = "live"
    except Exception as e:
        payload["sources"]["publisher"] = f"down: {type(e).__name__}"
        payload["ok"] = False
    # Stripe key check (no API call to save quota)
    payload["sources"]["stripe"] = (
        "key_present" if src.STRIPE_SECRET_KEY else "key_missing_awaiting_erwin"
    )
    return payload


@router.get("/houses", summary="15 maisons SSOT (Central Brain proxy)")
async def cof_houses() -> dict[str, Any]:
    """GET Central Brain :8767/api/central-brain/houses."""
    try:
        return await fetch_central_brain_houses()
    except Exception as e:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"central_brain_unreachable: {type(e).__name__}",
        )


@router.get("/publisher/status", summary="CofiaPublisher status (canon moteur)")
async def cof_publisher_status() -> dict[str, Any]:
    """GET CofiaPublisher :8540/api/status."""
    try:
        return await fetch_publisher_status()
    except Exception as e:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"publisher_unreachable: {type(e).__name__}",
        )


@router.get("/publisher/renders", summary="Liste MP4 renders prets publish")
async def cof_publisher_renders() -> dict[str, Any]:
    """GET CofiaPublisher :8540/api/renders."""
    try:
        return await fetch_publisher_renders()
    except Exception as e:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"publisher_unreachable: {type(e).__name__}",
        )


@router.get("/past-due", summary="Stripe past_due open invoices (vrai EUR recouvrable)")
async def cof_past_due() -> dict[str, Any]:
    """GET Stripe /v1/invoices?status=open — §35 Sidq no fake-green."""
    result = await fetch_stripe_past_due()
    if result.get("error") == "STRIPE_SECRET_KEY_required":
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "STRIPE_SECRET_KEY missing in env — paste in credentials.env then docker compose restart backend",
        )
    return result


@router.get("/revenue/summary", summary="MRR canon Stripe active subs")
async def cof_revenue_summary() -> dict[str, Any]:
    """GET Stripe /v1/subscriptions?status=active — MRR EUR + count."""
    result = await fetch_stripe_subscriptions_summary()
    if result.get("error") == "STRIPE_SECRET_KEY_required":
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "STRIPE_SECRET_KEY missing in env",
        )
    return result


@router.get("/iron/summary", summary="Iron CRM + brokers read-only summary (NY native)")
async def cof_iron_summary() -> dict[str, Any]:
    """Lecture NY native des clients/brokers, sans proxy Abidjan :8430."""
    try:
        return await fetch_iron_summary()
    except Exception as e:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"iron_summary_unavailable: {type(e).__name__}: {str(e)[:160]}",
        )


@router.get("/world", summary="Aggregator first-paint cockpit NY (graceful degradation)")
async def cof_world() -> dict[str, Any]:
    """Aggregate canon sources avec partial fallback (asyncio.gather return_exceptions)."""
    tasks = {
        "houses": fetch_central_brain_houses(),
        "publisher": fetch_publisher_status(),
        "iron": fetch_iron_summary(),
        "past_due": fetch_stripe_past_due(),
        "mrr": fetch_stripe_subscriptions_summary(),
    }
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    payload: dict[str, Any] = {"partial": False, "sources": {}}
    for name, res in zip(tasks.keys(), results, strict=True):
        if isinstance(res, Exception):
            payload["partial"] = True
            payload["sources"][name] = {
                "status": "down",
                "error": type(res).__name__,
            }
        elif isinstance(res, dict) and res.get("error"):
            payload["partial"] = True
            payload["sources"][name] = {
                "status": "degraded",
                "error": res["error"],
            }
        else:
            payload["sources"][name] = {"status": "live", "data": res}
    return payload
