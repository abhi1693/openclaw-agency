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


# Méthode canon Erwin (abo Pro 9$ payé) : piloter SON compte via cookie de session,
# relais local self-hosted gcui-art/suno-api (gratuit, pas de service tiers payant).
SUNO_COOKIE = os.environ.get("SUNO_COOKIE", "").strip()
SUNO_LOCAL_API = os.environ.get("SUNO_LOCAL_API", "http://127.0.0.1:3300").rstrip("/")


def mode() -> str:
    if SUNO_COOKIE:
        return "compte_pro_cookie"  # utilise les 9$ d'Erwin, auto
    if WRAPPER_BASE and WRAPPER_KEY:
        return "wrapper_tiers"
    if SUNO_DROP_DIR.exists() and any(SUNO_DROP_DIR.glob("*.mp3")):
        return "semi_manuel_drop"
    return "manual_pending"


def credits_via_relay() -> dict:
    """Lecture seule des crédits du compte Pro (relais :3300). SAFE — aucune génération, aucun risque ToS."""
    import httpx
    try:
        r = httpx.get(f"{SUNO_LOCAL_API}/api/get_limit", timeout=15)
        return {"ok": r.status_code == 200, "data": r.json() if r.status_code == 200 else r.text[:120]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"relais_absent:{type(e).__name__}"}


def generate_track(prompt: str, out_path: str, instrumental: bool = True, timeout_s: int = 180) -> dict:
    """HARD LOCK Erwin : génère une musique sur SON compte Pro (relais :3300) + download.
    POST /api/generate → poll /api/get?ids= jusqu'à audio_url → télécharge l'MP3. Utilise ses crédits."""
    import time as _t
    import httpx
    try:
        sub = httpx.post(f"{SUNO_LOCAL_API}/api/generate",
                         json={"prompt": prompt, "make_instrumental": instrumental, "wait_audio": False}, timeout=30)
        if sub.status_code != 200:
            return {"ok": False, "status": sub.status_code, "error": sub.text[:160]}
        clips = sub.json()
        ids = ",".join(c.get("id") for c in clips if c.get("id"))
        if not ids:
            return {"ok": False, "error": "no_clip_id", "raw": str(clips)[:160]}
        audio_url = None
        deadline = _t.time() + timeout_s
        while _t.time() < deadline:
            _t.sleep(6)
            g = httpx.get(f"{SUNO_LOCAL_API}/api/get?ids={ids}", timeout=20)
            if g.status_code == 200:
                for c in g.json():
                    if c.get("audio_url"):
                        audio_url = c["audio_url"]; break
            if audio_url:
                break
        if not audio_url:
            return {"ok": False, "error": "suno_timeout_no_audio"}
        au = httpx.get(audio_url, timeout=120, follow_redirects=True)
        with open(out_path, "wb") as f:
            f.write(au.content)
        return {"ok": True, "path": out_path, "bytes": len(au.content), "audio_url": audio_url}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}


def generate_via_account(prompt: str, instrumental: bool = True) -> dict:
    """⚠️ RISQUE ToS — automation du compte Suno via cookie = violation ToS → BAN possible (cf. incident Hedra).
    VERROUILLÉ : nécessite SUNO_COOKIE_GEN_GO=1 (GO Erwin explicite, conscient du risque ban).
    Par défaut on NE génère PAS via cookie. Musique = MusicGen local (auto safe) OU export manuel Suno (drop)."""
    if os.environ.get("SUNO_COOKIE_GEN_GO") != "1":
        return {"ok": False, "blocked": True,
                "reason": "Génération Suno par cookie = risque ban ToS. Bloqué par défaut. Musique → MusicGen local ou export manuel (drop). GO conscient = SUNO_COOKIE_GEN_GO=1.",
                "safe_alternatives": ["musicgen_local", "semi_manuel_drop", "credits_via_relay (lecture seule)"]}
    import httpx
    try:
        r = httpx.post(f"{SUNO_LOCAL_API}/api/generate",
                       json={"prompt": prompt, "make_instrumental": instrumental, "wait_audio": False}, timeout=30)
        return {"ok": r.status_code == 200, "status": r.status_code, "data": r.json() if r.status_code == 200 else r.text[:160]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"relais_absent:{type(e).__name__}"}


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
