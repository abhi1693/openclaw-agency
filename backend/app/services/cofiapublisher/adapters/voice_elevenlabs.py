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

# Modèle EXPRESSIF par défaut (doc ElevenLabs 2026) : eleven_v3 = dialogue expressif + audio tags
# ([pause], [excited], [emphasized]...). Vérifié 2026-05-29 : renvoie AUSSI les timestamps
# /with-timestamps → on garde les captions au mot. Override possible via ELEVEN_MODEL_ID.
DEFAULT_MODEL = os.environ.get("ELEVEN_MODEL_ID", "eleven_v3").strip()


def _voice_settings() -> dict:
    """Réglages doc-backed pour une narration vivante (pas plate/robotique).
    Doc : stability basse (25-50%) = + d'émotion ; style = expressivité ; speaker_boost = présence.
    Tunable via env (ELEVEN_STABILITY / ELEVEN_STYLE / ELEVEN_SIMILARITY)."""
    return {
        "stability": float(os.environ.get("ELEVEN_STABILITY", "0.35")),
        "similarity_boost": float(os.environ.get("ELEVEN_SIMILARITY", "0.8")),
        "style": float(os.environ.get("ELEVEN_STYLE", "0.45")),
        "use_speaker_boost": True,
    }


def available() -> bool:
    return bool(EL_KEY)


def synthesize(
    text: str,
    out_path: str,
    voice_id: str | None = None,
    model_id: str | None = None,
) -> dict:
    """Génère un MP3 depuis du texte. Retourne {ok, path, bytes} ou {ok:False, error}."""
    if not EL_KEY:
        return {"ok": False, "error": "ELEVENLABS_API_KEY_missing"}
    vid = (voice_id or DEFAULT_VOICE).strip()
    if not vid:
        return {"ok": False, "error": "no_voice_id"}
    model_id = (model_id or DEFAULT_MODEL).strip()
    try:
        r = httpx.post(
            f"{API}/text-to-speech/{vid}",
            headers={"xi-api-key": EL_KEY, "accept": "audio/mpeg", "content-type": "application/json"},
            json={"text": text, "model_id": model_id, "voice_settings": _voice_settings()},
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
    model_id: str | None = None,
    language_code: str | None = None,
    apply_text_normalization: str | None = None,
    optimize_streaming_latency: int | None = None,
    seed: int | None = None,
    voice_settings: dict | None = None,
) -> dict:
    """Génère le MP3 + l'alignement caractère-par-caractère (horloge maître captions kinetic).
    Params optionnels forçables par le voice_director (language_code, normalisation, latence, seed,
    voice_settings override). Retourne {ok, path, alignment:{characters[], starts_s[], ends_s[]}}."""
    import base64
    if not EL_KEY:
        return {"ok": False, "error": "ELEVENLABS_API_KEY_missing"}
    vid = (voice_id or DEFAULT_VOICE).strip()
    if not vid:
        return {"ok": False, "error": "no_voice_id"}
    model_id = (model_id or DEFAULT_MODEL).strip()
    payload: dict = {"text": text, "model_id": model_id,
                     "voice_settings": voice_settings or _voice_settings()}
    if language_code:
        payload["language_code"] = language_code
    if apply_text_normalization:
        payload["apply_text_normalization"] = apply_text_normalization
    if optimize_streaming_latency is not None:
        payload["optimize_streaming_latency"] = optimize_streaming_latency
    if seed is not None:
        payload["seed"] = seed
    try:
        r = httpx.post(
            f"{API}/text-to-speech/{vid}/with-timestamps",
            headers={"xi-api-key": EL_KEY, "content-type": "application/json"},
            json=payload,
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
