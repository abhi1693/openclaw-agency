"""CofiaPublisher — ORCHESTRATEUR (chef d'orchestre). GO Erwin 2026-05-29.

source_tag: NY_COFIAPUB_ORCHESTRATOR_20260529
Enchaîne TOUTES les modalités par tier (script→voix→image→vidéo→avatar→musique→sous-titres→
montage→QA→distribution), injecte le BRAND LAYER, respecte publish-lock §18.
`plan()` = construit le plan complet SANS rien générer ni dépenser (zéro produit).
`execute()` = gated derrière PRODUCE_GO (NON appelé tant qu'Erwin ne dit pas "produit").
"""
from __future__ import annotations

import os

from . import brand_assets, distribution, tiers

PIPELINE_STEPS = ["script", "voice", "image", "thumbnail", "video", "avatar", "music", "captions", "montage", "qa"]


def plan(tier: str = "economy", mode: str = "auto", prompt: str | None = None) -> dict:
    """Plan de production complet — quel outil à chaque étape, brand layer, coût estimé. NE PRODUIT RIEN."""
    t = tiers.Tier(tier)
    steps = []
    for s in PIPELINE_STEPS:
        if s == "montage":
            steps.append({"step": s, "provider": "remotion+ffmpeg_local"})
        elif s in tiers.TIER_MAP:
            steps.append({"step": s, "provider": tiers.provider_for(s, t)})
        else:
            steps.append({"step": s, "provider": "n/a"})
    return {
        "ok": True,
        "source_tag": "NY_COFIAPUB_ORCHESTRATOR_20260529",
        "tier": t.value,
        "mode": mode,  # auto = sujet/prompt généré ; manual = prompt Erwin
        "prompt": prompt or "(auto: scenario_doctor générera le sujet)",
        "estimated_cost_eur": tiers.TIER_COST_EUR[t],
        "steps": steps,
        "brand_layer": {k: v for k, v in brand_assets.verify().items()},
        "design_tools": list(tiers.DESIGN_TOOLS.keys()),
        "publish": distribution.PUBLISH_LOCK,
        "note": "PLAN seulement — aucune génération, aucun appel payant, aucune publication.",
    }


def execute(tier: str = "economy", mode: str = "auto", prompt: str | None = None) -> dict:
    """Exécution réelle (génère + monte). VERROUILLÉE : nécessite PRODUCE_GO=1 (GO Erwin explicite)."""
    if os.environ.get("PRODUCE_GO") != "1":
        return {"ok": False, "blocked": True,
                "reason": "PRODUCE_GO absent — exécution réelle = GO Erwin explicite (zéro produit par défaut).",
                "plan": plan(tier, mode, prompt)}
    # P3 : implémentation réelle (appels adapters dans l'ordre + Remotion + QA). Non câblé tant que pas de GO.
    return {"ok": False, "error": "execute_not_yet_wired_pending_first_GO"}
