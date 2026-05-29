"""CofiaPublisher — adapter MUSIQUE Suno (tier PREMIUM, Erwin abonné Pro 2026-05-29).

source_tag: NY_COFIAPUB_MUSIC_SUNO_20260529
Clé : SUNO_API_KEY (à générer sur suno.com/settings → coller dans content-apis.env).
L'abonnement Pro donne les crédits ; la clé API est séparée. Outil créatif (pas LLM, §15 ok).
Génération chanson (async) = P3 ; ici connectivité.
"""
from __future__ import annotations

import os

import httpx

SUNO_KEY = os.environ.get("SUNO_API_KEY", "").strip()
SUNO_BASE = os.environ.get("SUNO_API_BASE", "https://studio-api.suno.ai/api/v2").rstrip("/")


def available() -> bool:
    return bool(SUNO_KEY)


def connectivity() -> dict:
    """Vérifie présence + auth clé Suno. Sans clé → message clair (génère sur suno.com/settings)."""
    if not SUNO_KEY:
        return {"ok": False, "error": "SUNO_API_KEY_missing",
                "fix": "Générer la clé sur suno.com/settings (abo Pro actif) → ajouter SUNO_API_KEY dans content-apis.env"}
    try:
        r = httpx.get(f"{SUNO_BASE}/credits", headers={"Authorization": f"Bearer {SUNO_KEY}"}, timeout=15)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}
    return {"ok": r.status_code in (200, 401, 403, 404), "status": r.status_code,
            "auth": "valid" if r.status_code == 200 else "check_key_or_endpoint"}
