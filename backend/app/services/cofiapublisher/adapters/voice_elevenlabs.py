"""CofiaPublisher — adapter voix ElevenLabs (tier PREMIUM).

source_tag: NY_COFIAPUB_VOICE_ELEVENLABS_20260529
Clé : ELEVENLABS_API_KEY (content-apis.env, testée vivante HTTP 200 le 2026-05-29).
Local-only respecté : ElevenLabs = outil créatif (pas un LLM cloud banni §15).
"""
from __future__ import annotations

import os

import httpx

API = "https://api.elevenlabs.io/v1"
EL_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
DEFAULT_VOICE = os.environ.get("ELEVENLABS_FALLBACK_VOICE_ID", "").strip()


def available() -> bool:
    return bool(EL_KEY)


def synthesize(
    text: str,
    out_path: str,
    voice_id: str | None = None,
    model_id: str = "eleven_multilingual_v2",
) -> dict:
    """Génère un MP3 depuis du texte. Retourne {ok, path, bytes} ou {ok:False, error}."""
    if not EL_KEY:
        return {"ok": False, "error": "ELEVENLABS_API_KEY_missing"}
    vid = (voice_id or DEFAULT_VOICE).strip()
    if not vid:
        return {"ok": False, "error": "no_voice_id"}
    try:
        r = httpx.post(
            f"{API}/text-to-speech/{vid}",
            headers={"xi-api-key": EL_KEY, "accept": "audio/mpeg", "content-type": "application/json"},
            json={"text": text, "model_id": model_id,
                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}},
            timeout=60,
        )
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}
    if r.status_code != 200:
        return {"ok": False, "status": r.status_code, "error": r.text[:200]}
    with open(out_path, "wb") as f:
        f.write(r.content)
    return {"ok": True, "path": out_path, "bytes": len(r.content), "model": model_id, "voice_id": vid}


def synthesize_with_timestamps(
    text: str,
    out_path: str,
    voice_id: str | None = None,
    model_id: str = "eleven_multilingual_v2",
) -> dict:
    """Génère le MP3 + l'alignement caractère-par-caractère (horloge maître captions kinetic).
    Retourne {ok, path, alignment:{characters[], starts_s[], ends_s[]}}."""
    import base64
    if not EL_KEY:
        return {"ok": False, "error": "ELEVENLABS_API_KEY_missing"}
    vid = (voice_id or DEFAULT_VOICE).strip()
    if not vid:
        return {"ok": False, "error": "no_voice_id"}
    try:
        r = httpx.post(
            f"{API}/text-to-speech/{vid}/with-timestamps",
            headers={"xi-api-key": EL_KEY, "content-type": "application/json"},
            json={"text": text, "model_id": model_id,
                  "voice_settings": {"stability": 0.55, "similarity_boost": 0.75}},
            timeout=90,
        )
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}
    if r.status_code != 200:
        return {"ok": False, "status": r.status_code, "error": r.text[:200]}
    j = r.json()
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(j["audio_base64"]))
    al = j.get("alignment") or j.get("normalized_alignment") or {}
    return {"ok": True, "path": out_path,
            "alignment": {"characters": al.get("characters", []),
                          "starts_s": al.get("character_start_times_seconds", []),
                          "ends_s": al.get("character_end_times_seconds", [])}}
