"""CofiaPublisher — adapter AVATAR / lipsync Hedra Character-3 (tier PREMIUM).

source_tag: NY_COFIAPUB_AVATAR_HEDRA_20260529
Clé : HEDRA_API_KEY (content-apis.env / hedra.env), testée vivante HTTP 200 le 2026-05-29.
Hedra = talking-photo benchmark 2026 : image + audio -> vidéo lipsync. Outil créatif (pas LLM, §15 ok).
Génération complète (image+audio->video async) = P3 ; ici connectivité + capabilities live.
"""
from __future__ import annotations

import os

import httpx

BASE = "https://api.hedra.com/web-app/public"
HEDRA_KEY = os.environ.get("HEDRA_API_KEY", "").strip()


def available() -> bool:
    return bool(HEDRA_KEY)


def _headers() -> dict:
    return {"X-API-Key": HEDRA_KEY}


def list_voices() -> dict:
    """Connectivité + capabilities : liste les voix Hedra dispo (réponse réelle)."""
    if not HEDRA_KEY:
        return {"ok": False, "error": "HEDRA_API_KEY_missing"}
    try:
        r = httpx.get(f"{BASE}/voices", headers=_headers(), timeout=20)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}
    if r.status_code != 200:
        return {"ok": False, "status": r.status_code, "error": r.text[:160]}
    data = r.json()
    voices = data if isinstance(data, list) else data.get("voices", data)
    n = len(voices) if isinstance(voices, list) else None
    return {"ok": True, "voices_count": n, "raw_type": type(data).__name__}


# generate(image_path, audio_path) -> video : implémenté en P3 (upload assets + create generation + poll).
