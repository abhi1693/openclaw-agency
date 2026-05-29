"""CofiaPublisher — MUSIQUE (réalité honnête Suno).

source_tag: NY_COFIAPUB_MUSIC_20260529
⚠️ Suno n'a AUCUNE API officielle / portail dev / clé self-service (vérifié 2026-05-29).
L'abo Pro d'Erwin = crédits dans l'app web suno.com, PAS un accès API.
Donc 3 modes :
  - ÉCONOMIE  : MusicGen local (full-auto, 0€).
  - SEMI-MANUEL (Suno) : Erwin génère dans l'app web → export MP3 → dépose dans SUNO_DROP_DIR ;
                          le pipeline ingère le dernier track déposé. (recommandé pour qualité Suno)
  - WRAPPER TIERS (optionnel) : si SUNO_WRAPPER_BASE + SUNO_WRAPPER_KEY fournis (Sunor/sunoapi.org/PiAPI),
                          génération auto via service tiers (compte séparé, zone grise ToS).
"""
from __future__ import annotations

import os
from pathlib import Path

SUNO_DROP_DIR = Path(os.environ.get("SUNO_DROP_DIR", "/Users/burakokyay/.openclaw/content/suno_drop"))
WRAPPER_BASE = os.environ.get("SUNO_WRAPPER_BASE", "").strip()
WRAPPER_KEY = os.environ.get("SUNO_WRAPPER_KEY", "").strip()


def mode() -> str:
    if WRAPPER_BASE and WRAPPER_KEY:
        return "wrapper_tiers"
    if SUNO_DROP_DIR.exists() and any(SUNO_DROP_DIR.glob("*.mp3")):
        return "semi_manuel_drop"
    return "manual_pending"


def latest_drop() -> dict:
    """Dernier MP3 Suno exporté manuellement (semi-auto)."""
    try:
        mp3s = sorted(SUNO_DROP_DIR.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
        if mp3s:
            return {"ok": True, "path": str(mp3s[0]), "bytes": mp3s[0].stat().st_size}
        return {"ok": False, "error": "no_track_in_drop", "drop_dir": str(SUNO_DROP_DIR)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}"}


def status() -> dict:
    return {"ok": True, "mode": mode(),
            "note": "Suno = pas d'API officielle. Eco=MusicGen local | Suno=export manuel→drop | wrapper tiers optionnel.",
            "drop_dir": str(SUNO_DROP_DIR), "wrapper_configured": bool(WRAPPER_BASE and WRAPPER_KEY)}
