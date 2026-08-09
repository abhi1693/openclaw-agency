"""CofiaPublisher — adapter AVATAR / lipsync via Fal (LatentSync) — tier MEDIUM.

source_tag: NY_COFIAPUB_AVATAR_FAL_20260529
Clé : FAL_KEY / FAL_API_KEY (content-apis.env), testée vivante (auth OK) le 2026-05-29.
Sert de FALLBACK avatar quand Hedra est indisponible (ex: compte free-tier). LatentSync = lipsync
diffusion open-source hébergé sur Fal. Outil créatif (pas LLM, §15 ok).
Génération complète (image+audio->video async) = P3 ; ici connectivité auth.
"""
from __future__ import annotations

import os

import httpx

FAL_KEY = (os.environ.get("FAL_KEY") or os.environ.get("FAL_API_KEY") or "").strip()
MODEL = "fal-ai/latentsync"


def available() -> bool:
    return bool(FAL_KEY)


def connectivity() -> dict:
    """Vérifie l'auth Fal sans générer (status d'un id inexistant : 404=auth OK, 401=clé KO)."""
    if not FAL_KEY:
        return {"ok": False, "error": "FAL_KEY_missing"}
    try:
        r = httpx.get(
            f"https://queue.fal.run/{MODEL}/requests/connectivity-probe/status",
            headers={"Authorization": f"Key {FAL_KEY}"},
            timeout=15,
        )
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}
    auth_ok = r.status_code in (200, 400, 404, 422)  # tout sauf 401/403 = clé acceptée
    return {"ok": auth_ok, "status": r.status_code, "model": MODEL,
            "auth": "valid" if auth_ok else "rejected"}
