"""CofiaPublisher — ORCHESTRATEUR (chef d'orchestre). GO Erwin 2026-05-29.

source_tag: NY_COFIAPUB_ORCHESTRATOR_20260529
plan() = plan complet + estimation coût RÉELLE (zéro génération).
execute() = gated PRODUCE_GO=1 + PLAFOND coût (MAX_COST_EUR) + idempotence.
  Tier ÉCONOMIE = chaîne 100% locale réelle (voix say + clip stock + montage ffmpeg + QA) → vrai MP4, 0€.
  Tiers cloud (medium/premium) = NON câblés tant que la 1ère vidéo éco n'est pas validée (honnête).
Publish reste 🔒 (§18) — execute ne publie JAMAIS, produit un fichier local seulement.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path

from . import brand_assets, distribution, qa, tiers
from .adapters import image_gen, video_stock, voice_elevenlabs, voice_local

OUT_ROOT = Path("/Users/burakokyay/.openclaw/state/cofiapublisher/produced")
PIPELINE_STEPS = ["script", "voice", "image", "thumbnail", "video", "avatar", "music", "captions", "montage", "qa"]


def _providers(t: tiers.Tier) -> list[str]:
    out = []
    for s in PIPELINE_STEPS:
        if s == "montage":
            out.append("remotion+ffmpeg_local")
        elif s in tiers.TIER_MAP:
            out.append(tiers.provider_for(s, t))
    return out


def plan(tier: str = "economy", mode: str = "auto", prompt: str | None = None, duration_s: int = 60) -> dict:
    t = tiers.Tier(tier)
    provs = _providers(t)
    return {
        "ok": True, "source_tag": "NY_COFIAPUB_ORCHESTRATOR_20260529", "tier": t.value, "mode": mode,
        "prompt": prompt or "(auto: scenario_doctor)",
        "estimated_cost_eur": tiers.estimate_cost_eur(provs, duration_s),
        "duration_s": duration_s,
        "steps": [{"step": s, "provider": p} for s, p in zip([x for x in PIPELINE_STEPS], provs)],
        "brand_layer_ok": all(brand_assets.verify().values()),
        "publish": distribution.PUBLISH_LOCK,
        "note": "PLAN — aucune génération, aucun appel payant, aucune publication.",
    }


def execute(tier: str = "economy", mode: str = "manual", prompt: str = "COF Trading", duration_s: int = 12) -> dict:
    """Exécution réelle. GATED PRODUCE_GO=1 + plafond MAX_COST_EUR. Économie = vrai MP4 local 0€."""
    t = tiers.Tier(tier)
    p = plan(tier, mode, prompt, duration_s)
    est = p["estimated_cost_eur"]
    ceiling = float(os.environ.get("MAX_COST_EUR", "3"))

    if os.environ.get("PRODUCE_GO") != "1":
        return {"ok": False, "blocked": True, "reason": "PRODUCE_GO absent (zéro produit par défaut)", "plan": p}
    if est > ceiling:
        return {"ok": False, "blocked": True, "reason": f"coût estimé {est}€ > plafond {ceiling}€ (MAX_COST_EUR)", "plan": p}
    if t is not tiers.Tier.ECONOMY:
        return {"ok": False, "reason": f"tier {t.value} cloud non câblé — valider d'abord la vidéo ÉCONOMIE locale (honnête)", "plan": p}

    # ── Chaîne ÉCONOMIE 100% locale (0€) ──
    if not shutil.which("ffmpeg"):
        return {"ok": False, "error": "ffmpeg_absent"}
    run_id = f"eco_{int(time.time())}"
    rd = OUT_ROOT / run_id
    rd.mkdir(parents=True, exist_ok=True)
    steps = {}

    # 1) Voix locale (say)
    voice_mp3 = str(rd / "voice.mp3")
    if not os.path.exists(voice_mp3):  # idempotence
        vr = voice_local.synthesize(prompt, voice_mp3)
        if not vr.get("ok"):
            return {"ok": False, "error": "voice_failed", "detail": vr, "run": run_id}
    steps["voice"] = {"ok": True, "path": voice_mp3}

    # durée voix → durée vidéo
    try:
        vdur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice_mp3],
                                    capture_output=True, text=True, timeout=20).stdout.strip() or duration_s)
    except Exception:  # noqa: BLE001
        vdur = duration_s

    # 2) Clip stock (Pexels) — idempotent
    clip = str(rd / "clip.mp4")
    if not os.path.exists(clip):
        sr = video_stock.search_pexels_video(prompt, per_page=3, orientation="portrait")
        vids = sr.get("videos") or []
        if not vids:
            return {"ok": False, "error": "no_stock_clip", "detail": sr, "run": run_id}
        dl = video_stock.download(vids[0]["file_url"], clip)
        if not dl.get("ok"):
            return {"ok": False, "error": "clip_download_failed", "detail": dl, "run": run_id}
    steps["video"] = {"ok": True, "path": clip}

    # 3) Montage ffmpeg : clip vertical 1080x1920 bouclé/coupé à la durée voix + audio voix
    out_mp4 = str(rd / "video_economy.mp4")
    cmd = ["ffmpeg", "-y", "-stream_loop", "-1", "-i", clip, "-i", voice_mp3,
           "-map", "0:v:0", "-map", "1:a:0", "-t", f"{vdur:.2f}",
           "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
           "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out_mp4]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if r.returncode != 0 or not os.path.exists(out_mp4):
        return {"ok": False, "error": "ffmpeg_failed", "stderr": r.stderr[-300:], "run": run_id}
    steps["montage"] = {"ok": True, "path": out_mp4}

    # 4) QA honnête
    qv = qa.review(out_mp4)
    steps["qa"] = qv

    return {"ok": True, "run": run_id, "tier": "economy", "cost_eur": est,
            "output": out_mp4, "duration_s": round(vdur, 2), "qa": qv,
            "publish": distribution.PUBLISH_LOCK, "steps": steps,
            "note": "Vidéo LOCALE produite (0€). Non publiée (§18). Brand overlay + captions = itération suivante."}
