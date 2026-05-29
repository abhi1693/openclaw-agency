"""CofiaPublisher — adapter voix LOCALE (tier ÉCONOMIE, 0€, 100% local).

source_tag: NY_COFIAPUB_VOICE_LOCAL_20260529
Baseline garantie : `say` macOS (TTS système) → AIFF → MP3 via ffmpeg. Zéro coût, zéro cloud (§15).
Évolutif : XTTS-v2 / Piper si modèles installés (qualité voix clonée). Détection auto.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path


def available() -> bool:
    return shutil.which("say") is not None


def synthesize(text: str, out_path: str, voice: str = "Thomas", rate: int = 180) -> dict:
    """Génère un MP3 local via `say` + ffmpeg. voice 'Thomas'=FR. Retourne {ok, path, bytes}."""
    if not available():
        return {"ok": False, "error": "say_not_available"}
    try:
        with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as tmp:
            aiff = tmp.name
        subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", aiff, text], check=True, timeout=60)
        if shutil.which("ffmpeg"):
            subprocess.run(["ffmpeg", "-y", "-i", aiff, "-codec:a", "libmp3lame", "-b:a", "128k", out_path],
                           check=True, capture_output=True, timeout=60)
            Path(aiff).unlink(missing_ok=True)
        else:
            out_path = aiff  # fallback aiff si ffmpeg absent
        b = Path(out_path).stat().st_size
        return {"ok": True, "path": out_path, "bytes": b, "engine": "say+ffmpeg", "voice": voice}
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": f"subprocess:{e.returncode}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}
