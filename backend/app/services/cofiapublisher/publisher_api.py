#!/usr/bin/env python3
"""publisher_api.py — endpoints READ-ONLY CofiaPublisher (R2).
APIRouter prêt à monter dans le hub PLUS TARD (app.include_router(publisher_router)).
NON monté ici : ne touche pas le hub live (8430) ni WorldMapLiving.
Sert uniquement la data JSON DÉJÀ existante. Aucun POST publication (publish lock §18).
Test standalone : `uvicorn ... _publisher_api_standalone:app --port 8541`.
"""
from __future__ import annotations
import json, os
from pathlib import Path
from fastapi import APIRouter, HTTPException

ROOT = Path.home() / ".openclaw/state/cofiapublisher"
MOCK = Path.home() / ".openclaw/state/mockups"
PRODUCED = ROOT / "produced"

publisher_router = APIRouter(prefix="/publisher", tags=["cofiapublisher"])


def _load(p: Path):
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"absent: {p.name}")
    return json.loads(p.read_text())


@publisher_router.get("/overview")
def overview():
    """Scores maisons + hub readiness (read-only)."""
    return {"publish_lock": "§18 — read-only, aucune publication", **_load(MOCK / "studio_scoreboard.json")}


@publisher_router.get("/runs")
def runs():
    """Runs vidéo + verdicts vs contrat HTML (read-only). Scan produced/ pour la vérité terrain."""
    sc = _load(ROOT / "run_scorecard.json")
    live = []
    if PRODUCED.exists():
        for d in sorted(PRODUCED.glob("vip_*")):
            mp4 = d / "video_final.mp4"
            live.append({"run": d.name, "has_mp4": mp4.exists(),
                         "bytes": (mp4.stat().st_size if mp4.exists() else 0)})
    return {"publish_lock": "§18", "scorecard": sc, "produced_live": live}


@publisher_router.get("/assets")
def assets():
    """Inventaire assets 6 statuts (read-only)."""
    return {"publish_lock": "§18", "master_map": _load(ROOT / "asset_master_map.json"),
            "contract_coverage": _load(MOCK / "html_contract_coverage.json")}
