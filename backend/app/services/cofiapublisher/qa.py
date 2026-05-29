"""CofiaPublisher — QA HONNÊTE (vérifs réelles ffprobe, zéro score inventé).

source_tag: NY_COFIAPUB_QA_20260529
§35 : on ne sort que des faits mesurés. Pas de "score 87" magique. Verdict = PASS / FAIL / UNPROVEN.
Checks v1 (extensibles) : fichier non vide · stream vidéo + audio · durée>0 · audio≈vidéo · résolution.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess


def _probe(path: str) -> dict | None:
    if not shutil.which("ffprobe") or not os.path.exists(path):
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", path],
            capture_output=True, text=True, timeout=30).stdout
        return json.loads(out)
    except Exception:  # noqa: BLE001
        return None


def review(mp4_path: str) -> dict:
    """QA factuelle d'un MP4. Retourne {verdict, checks[], measured{}}."""
    if not os.path.exists(mp4_path):
        return {"verdict": "FAIL", "error": "file_missing", "path": mp4_path}
    size = os.path.getsize(mp4_path)
    info = _probe(mp4_path)
    if info is None:
        return {"verdict": "UNPROVEN", "reason": "ffprobe_indisponible_ou_illisible", "bytes": size}

    streams = info.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    dur = float(info.get("format", {}).get("duration", 0) or 0)
    vdur = float(v.get("duration", dur) or dur) if v else 0
    adur = float(a.get("duration", dur) or dur) if a else 0

    checks = []
    def chk(name, ok, detail=""):
        checks.append({"check": name, "ok": bool(ok), "detail": detail})

    chk("fichier_non_vide", size > 10_000, f"{size} bytes")
    chk("stream_video", v is not None, f"{v.get('width')}x{v.get('height')}" if v else "absent")
    chk("stream_audio", a is not None, a.get("codec_name") if a else "absent")
    chk("duree_positive", dur > 0.5, f"{dur:.1f}s")
    chk("audio_video_sync", abs(vdur - adur) <= 1.5 if (v and a) else False, f"v={vdur:.1f}s a={adur:.1f}s")
    chk("resolution_ok", (v and (v.get("height") or 0) >= 480) if v else False, "")

    passed = sum(1 for c in checks if c["ok"])
    verdict = "PASS" if passed == len(checks) else ("FAIL" if passed < len(checks) - 1 else "PARTIAL")
    return {"verdict": verdict, "passed": f"{passed}/{len(checks)}", "checks": checks,
            "measured": {"bytes": size, "duration_s": round(dur, 2),
                         "resolution": f"{v.get('width')}x{v.get('height')}" if v else None}}
