"""CofiaPublisher — adapter VOIX OpenAI TTS (tier MEDIUM).

source_tag: NY_COFIAPUB_VOICE_OPENAI_20260529
Clé : OPENAI_API_KEY (credentials.env). Endpoint /v1/audio/speech (TTS, pas un LLM/codex — usage créatif).
Génération = P3 ; ici connectivité + helper synth prêt.
"""
from __future__ import annotations

import os

import httpx

OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]


def available() -> bool:
    return bool(OPENAI_KEY)


def synthesize(text: str, out_path: str, voice: str = "onyx", model: str = "tts-1-hd") -> dict:
    """Génère un MP3 via OpenAI TTS. Retourne {ok, path, bytes}."""
    if not OPENAI_KEY:
        return {"ok": False, "error": "OPENAI_API_KEY_missing"}
    try:
        r = httpx.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
            json={"model": model, "voice": voice, "input": text, "response_format": "mp3"},
            timeout=60,
        )
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}
    if r.status_code != 200:
        return {"ok": False, "status": r.status_code, "error": r.text[:200]}
    with open(out_path, "wb") as f:
        f.write(r.content)
    return {"ok": True, "path": out_path, "bytes": len(r.content), "voice": voice, "model": model}
