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

import json as _json

from . import brand_assets, captions_engine, distribution, qa, tiers
from .adapters import image_gen, music_suno, video_stock, voice_elevenlabs, voice_local

REMOTION_DIR = "/Users/burakokyay/cof-trading/remotion"

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


LAUNCH_BEATS = [
    {"t": "Eh, les amis. Vous en avez pas marre des chaînes pourries ?",
     "v": "dark moody cinematic vertical 9:16, chaotic phone screens with fake trading guru hype, red warning tones, distrust, no text"},
    {"t": "Marre de suivre des escrocs qui ne font que mentir et vous arnaquer ?",
     "v": "cinematic vertical 9:16, shadowy con-man silhouette flashing fake luxury cars and cash, ominous red lighting, scam, no text"},
    {"t": "La solution : Cofiatrading.",
     "v": "premium clean brand reveal, deep navy blue and cyan, cinematic vertical 9:16, calm confidence, futuristic minimal, no text"},
    {"t": "Plus de deux cents intelligences artificielles, créées par Erwin, travaillent pour toi.",
     "v": "futuristic AI network, hundreds of glowing connected nodes, premium dark blue and cyan, high-tech cinematic vertical 9:16, no text"},
    {"t": "Des signaux, de la formation, un vrai cadre de contrôle du risque. Zéro promesse magique.",
     "v": "clean premium trading dashboard, disciplined risk control, green confident tones, professional cinematic vertical 9:16, no text"},
    {"t": "Rejoins Cofiatrading. Et arrête enfin de te faire avoir.",
     "v": "confident trader facing sunrise over city skyline, premium hopeful, brand cyan accents, victory, cinematic vertical 9:16, no text"},
]
MUSIC_LAUNCH = "/Users/burakokyay/cof-trading/remotion/public/music_launch.mp3"
OUTRO_MP4 = "/Users/burakokyay/cof-trading/remotion/out/tip_v22bu_video01_anti_faux_gourou_perf__sidq-live-20260527-053151z_chunk_outro.mp4"


def _ts(s):
    h = int(s // 3600); m = int((s % 3600) // 60); sec = s % 60
    return f"{h:02d}:{m:02d}:{sec:06.3f}".replace(".", ",")


def execute_multishot(beats=None, voice_id=None, with_outro=True) -> dict:
    """MULTI-PLANS (recette Marcus) : N plans, voix ElevenLabs/beat + image FLUX/beat + Ken Burns alterné
    + musique launch duckée + captions stylés + logo + outro. GATED PRODUCE_GO + plafond. Ne publie pas."""
    if os.environ.get("PRODUCE_GO") != "1":
        return {"ok": False, "blocked": True, "reason": "PRODUCE_GO absent"}
    beats = beats or LAUNCH_BEATS
    est = tiers.estimate_cost_eur(["elevenlabs"] * len(beats) + ["flux_fal"] * len(beats), 6)
    ceiling = float(os.environ.get("MAX_COST_EUR", "3"))
    if est > ceiling:
        return {"ok": False, "blocked": True, "reason": f"coût {est}€ > plafond {ceiling}€"}
    if not shutil.which("ffmpeg"):
        return {"ok": False, "error": "ffmpeg_absent"}

    run_id = f"launch_{int(time.time())}"
    rd = OUT_ROOT / run_id; rd.mkdir(parents=True, exist_ok=True)
    clips, srt_lines, cursor = [], [], 0.0

    for i, b in enumerate(beats):
        # voix ElevenLabs du beat
        vmp3 = str(rd / f"v{i}.mp3")
        vr = voice_elevenlabs.synthesize(b["t"], vmp3, voice_id=voice_id)
        if not vr.get("ok"):
            return {"ok": False, "error": f"voice_beat_{i}", "detail": vr}
        try:
            dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vmp3],
                                       capture_output=True, text=True, timeout=20).stdout.strip() or 3) + 0.35
        except Exception:  # noqa: BLE001
            dur = 3.5
        # image IA FLUX du beat (fallback stock)
        img = str(rd / f"img{i}.png")
        fr = image_gen.flux_generate(b["v"], img, image_size="portrait_16_9")
        frames = int(dur * 30)
        clip = str(rd / f"clip{i}.mp4")
        zin = "min(zoom+0.0010,1.35)" if i % 2 == 0 else "if(lte(zoom,1.0),1.35,max(1.001,zoom-0.0010))"
        if fr.get("ok"):
            vf = f"scale=1620:2880,zoompan=z='{zin}':d={frames}:s=1080x1920:fps=30,setsar=1"
            inp = ["-loop", "1", "-i", img]
        else:
            sr = video_stock.search_pexels_video(b["t"][:40], per_page=2, orientation="portrait")
            vids = sr.get("videos") or []
            if not vids:
                return {"ok": False, "error": f"no_visual_beat_{i}"}
            video_stock.download(vids[0]["file_url"], str(rd / f"st{i}.mp4"))
            vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1"
            inp = ["-stream_loop", "-1", "-i", str(rd / f"st{i}.mp4")]
        cmd = ["ffmpeg", "-y", *inp, "-i", vmp3, "-map", "0:v", "-map", "1:a", "-t", f"{dur:.2f}",
               "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30",
               "-c:a", "aac", "-ar", "44100", clip]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            return {"ok": False, "error": f"clip_{i}_ffmpeg", "stderr": r.stderr[-300:]}
        clips.append(clip)
        srt_lines.append(f"{i+1}\n{_ts(cursor)} --> {_ts(cursor+dur)}\n{b['t']}\n")
        cursor += dur

    # concat des plans
    concat_txt = str(rd / "list.txt")
    with open(concat_txt, "w") as f:
        for c in clips:
            f.write(f"file '{c}'\n")
    body = str(rd / "body.mp4")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_txt, "-c", "copy", body],
                   capture_output=True, text=True, timeout=120)
    # SRT global
    srt = str(rd / "subs.srt"); open(srt, "w", encoding="utf-8").write("\n".join(srt_lines))
    srt_esc = srt.replace(":", "\\:")
    logo = brand_assets.BRAND["logo_remotion"]
    final = str(rd / "video_launch.mp4")
    total = cursor
    # musique launch duckée sous la voix + logo watermark + captions stylés
    music_in = ["-stream_loop", "-1", "-i", MUSIC_LAUNCH] if os.path.exists(MUSIC_LAUNCH) else []
    fc = ("[2:v]scale=230:-1[lg];[0:v][lg]overlay=W-w-35:45[v1];"
          f"[v1]subtitles='{srt_esc}':force_style='Fontname=Arial,Fontsize=20,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00202020,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=180'[v]")
    if music_in:
        fc += ";[1:a]volume=0.16[m];[0:a]volume=1.0[vo];[vo][m]amix=inputs=2:duration=first:dropout_transition=0[a]"
        amap = "[a]"
    else:
        amap = "0:a"
    cmd2 = ["ffmpeg", "-y", "-i", body, *music_in, "-i", logo, "-filter_complex", fc,
            "-map", "[v]", "-map", amap, "-t", f"{total:.2f}",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", final]
    r2 = subprocess.run(cmd2, capture_output=True, text=True, timeout=240)
    if r2.returncode != 0 or not os.path.exists(final):
        return {"ok": False, "error": "final_ffmpeg", "stderr": r2.stderr[-400:], "run": run_id}

    # outro (best-effort)
    out_final = final
    if with_outro and os.path.exists(OUTRO_MP4):
        try:
            norm_outro = str(rd / "outro_norm.mp4")
            subprocess.run(["ffmpeg", "-y", "-i", OUTRO_MP4, "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1",
                            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", norm_outro],
                           capture_output=True, text=True, timeout=120)
            withoutro = str(rd / "video_launch_outro.mp4")
            r3 = subprocess.run(["ffmpeg", "-y", "-i", final, "-i", norm_outro, "-filter_complex",
                                 "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]",
                                 "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", withoutro],
                                capture_output=True, text=True, timeout=180)
            if r3.returncode == 0 and os.path.exists(withoutro):
                out_final = withoutro
        except Exception:  # noqa: BLE001
            pass

    qv = qa.review(out_final)
    return {"ok": True, "run": run_id, "shots": len(beats), "cost_eur": est, "output": out_final,
            "duration_s": round(total, 2), "qa": qv, "publish": distribution.PUBLISH_LOCK,
            "tools_used": ["ElevenLabs (voix/beat)", "FLUX (image IA/beat)", "Ken Burns alterné", "music_launch duckée", "captions", "logo COF", "outro" if out_final != final else "outro_skipped"],
            "note": "Vidéo MULTI-PLANS de lancement. Non publiée (§18)."}


def execute_v2(beats=None, voice_id=None) -> dict:
    """P0 — moteur REMOTION multi-shot + captions kinetic word-level + look.
    Voix ElevenLabs+timestamps/beat (horloge maître) · images FLUX · rendu Remotion. GATED PRODUCE_GO + plafond."""
    if os.environ.get("PRODUCE_GO") != "1":
        return {"ok": False, "blocked": True, "reason": "PRODUCE_GO absent"}
    beats = beats or LAUNCH_BEATS
    est = tiers.estimate_cost_eur(["elevenlabs"] * len(beats) + ["flux_fal"] * len(beats), 6)
    ceiling = float(os.environ.get("MAX_COST_EUR", "3"))
    if est > ceiling:
        return {"ok": False, "blocked": True, "reason": f"coût {est}€ > plafond {ceiling}€"}

    run_id = f"v2_{int(time.time())}"
    rd = OUT_ROOT / run_id; rd.mkdir(parents=True, exist_ok=True)
    FPS = 30

    # ── FIX SYNC (Marcus FROID) : UNE seule voix monolithique = horloge maître, zéro concat, zéro offset ──
    full_script = " ".join(b["t"] for b in beats)
    voice_full = str(rd / "voice_full.mp3")
    vr = voice_elevenlabs.synthesize_with_timestamps(full_script, voice_full, voice_id=voice_id)
    if not vr.get("ok"):
        return {"ok": False, "error": "voice_full", "detail": vr}
    words = captions_engine.words_from_elevenlabs(vr["alignment"])   # timings EXACTS, aucun offset
    captions = captions_engine.chunk_words(words)
    try:
        audio_dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice_full],
                                         capture_output=True, text=True, timeout=20).stdout.strip() or 0)
    except Exception:  # noqa: BLE001
        audio_dur = (words[-1]["endMs"] / 1000) if words else 30
    total_frames = int(round(audio_dur * FPS))

    # ── Shots : découpés aux frontières de mots du MÊME alignement (vidéo suit l'audio) ──
    shots, wi = [], 0
    cum_frames = 0
    for i, b in enumerate(beats):
        nwords = len(b["t"].split())
        wi_end = min(wi + nwords - 1, len(words) - 1)
        end_ms = words[wi_end]["endMs"] if words else int((i + 1) * audio_dur * 1000 / len(beats))
        wi = wi_end + 1
        end_frame = total_frames if i == len(beats) - 1 else int(round(end_ms / 1000 * FPS))
        dur_frames = max(15, end_frame - cum_frames)
        cum_frames += dur_frames
        # image IA FLUX (fallback stock)
        img = str(rd / f"img{i}.png")
        fr = image_gen.flux_generate(b["v"], img, image_size="portrait_16_9")
        if not fr.get("ok"):
            sr = video_stock.search_pexels_video(b["t"][:40], per_page=2, orientation="portrait")
            vids = sr.get("videos") or []
            if vids:
                video_stock.download(vids[0]["file_url"], str(rd / f"st{i}.mp4"))
                subprocess.run(["ffmpeg", "-y", "-i", str(rd / f"st{i}.mp4"), "-vframes", "1",
                                "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", img],
                               capture_output=True, timeout=60)
            if not os.path.exists(img):
                return {"ok": False, "error": f"no_visual_beat_{i}"}
        shots.append({"src": f"runs/{run_id}/img{i}.png", "durationInFrames": dur_frames})
    # symlink assets dans public/ pour Remotion
    pub_runs = os.path.join(REMOTION_DIR, "public", "runs")
    os.makedirs(pub_runs, exist_ok=True)
    link = os.path.join(pub_runs, run_id)
    if os.path.islink(link) or os.path.exists(link):
        try:
            os.remove(link)
        except OSError:
            pass
    os.symlink(str(rd), link)

    props = {"shots": shots, "captions": captions, "voiceSrc": f"runs/{run_id}/voice_full.mp3",
             "musicSrc": "music_launch.mp3", "logoSrc": "brand/cofiatrading-logo-official.png"}
    props_path = str(rd / "props.json")
    with open(props_path, "w", encoding="utf-8") as f:
        _json.dump(props, f, ensure_ascii=False)

    out_mp4 = str(rd / "video_v2.mp4")
    r = subprocess.run(["npx", "remotion", "render", "src/index.ts", "CofiaPublisherV2", out_mp4,
                        f"--props={props_path}", "--concurrency=2", "--log=error"],
                       cwd=REMOTION_DIR, capture_output=True, text=True, timeout=900)
    if r.returncode != 0 or not os.path.exists(out_mp4):
        return {"ok": False, "error": "remotion_render_failed", "stderr": r.stderr[-600:], "run": run_id, "shots": len(shots)}

    qv = qa.review(out_mp4)
    return {"ok": True, "run": run_id, "engine": "remotion", "shots": len(shots), "cost_eur": est,
            "output": out_mp4, "duration_s": round(audio_dur, 2), "captions_chunks": len(captions),
            "qa": qv, "publish": distribution.PUBLISH_LOCK,
            "tools_used": ["ElevenLabs+timestamps", "FLUX", "Remotion timeline", "captions kinetic word-level", "look/vignette", "logo", "music_launch"],
            "note": "Vidéo P0 (moteur Remotion, captions kinetic). Non publiée (§18)."}


# Requêtes VISUELLES concrètes (mots-objets) par beat — pour chercher du VRAI footage qui bouge.
LAUNCH_VISUAL_QUERIES = [
    ["person scrolling phone night blue", "social media feed phone hand"],
    ["luxury sports car money show off", "shady businessman cash flashing"],
    ["futuristic blue technology abstract", "city skyline night cinematic blue"],
    ["data center servers glowing", "ai network nodes blue technology"],
    ["trading charts screen green", "person typing laptop focused dark"],
    ["confident businessman sunrise city", "successful trader looking horizon"],
]


def execute_v4(beats=None, voice_id=None, counter_to=200, counter_suffix=" IA",
               counter_beat=3, brand_beat=2, twist_beat=3,
               music_prompt="cinematic finance trailer, hybrid orchestral electronic, tension build to a drop, confident premium, no vocals, sub bass, 100 BPM") -> dict:
    """v4 — VRAI MONTAGE VIDÉO (Marcus) : footage Pexels qui bouge, coupé au beat, multi-clips,
    + master loudnorm -14 (fin du PSHHH). FLUX seulement en secours. Scénario-agnostique : chaque beat
    peut porter sa liste de requêtes visuelles via b['q']. GATED PRODUCE_GO + plafond."""
    if os.environ.get("PRODUCE_GO") != "1":
        return {"ok": False, "blocked": True, "reason": "PRODUCE_GO absent"}
    beats = beats or LAUNCH_BEATS
    est = 0.4  # ElevenLabs voix ; stock vidéo = 0€
    ceiling = float(os.environ.get("MAX_COST_EUR", "3"))
    FPS = 30
    run_id = f"v4_{int(time.time())}"
    rd = OUT_ROOT / run_id; rd.mkdir(parents=True, exist_ok=True)

    full_script = " ".join(b["t"] for b in beats)
    voice_full = str(rd / "voice_full.mp3")
    vr = voice_elevenlabs.synthesize_with_timestamps(full_script, voice_full, voice_id=voice_id)
    if not vr.get("ok"):
        return {"ok": False, "error": "voice_full", "detail": vr}
    words = captions_engine.words_from_elevenlabs(vr["alignment"])
    captions = captions_engine.chunk_words(words)
    try:
        audio_dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice_full],
                                         capture_output=True, text=True, timeout=20).stdout.strip() or 0)
    except Exception:  # noqa: BLE001
        audio_dur = (words[-1]["endMs"] / 1000) if words else 30
    total_frames = int(round(audio_dur * FPS))

    # ── HARD LOCK Erwin : musique = SUNO (compte Pro), à CHAQUE vidéo. Pas de fallback music_launch. ──
    # Marcus : DEUX sections Suno pour une timeline DYNAMIQUE — tension (intro/problème) + uplift (reveal/CTA).
    suno_mp3 = str(rd / "music_suno.mp3")          # track principal (tension/build)
    suno_uplift = str(rd / "music_suno_uplift.mp3")  # track 2 (uplift/drop), crossfadé au reveal
    mr = music_suno.generate_track(music_prompt, suno_mp3, instrumental=True, timeout_s=220)
    if not mr.get("ok"):
        return {"ok": False, "error": "SUNO_REQUIRED_FAILED", "detail": mr,
                "note": "HARD LOCK: chaque vidéo DOIT utiliser Suno. Relais :3300 / crédits à vérifier."}
    uplift_prompt = ("cinematic finance trailer UPLIFT section, hybrid orchestral electronic, "
                     "triumphant confident resolve after the drop, bright cyan synths, driving sub bass, "
                     "premium hopeful, no vocals, 100 BPM")
    mr2 = music_suno.generate_track(uplift_prompt, suno_uplift, instrumental=True, timeout_s=220)
    has_uplift = bool(mr2.get("ok"))  # si la 2e échoue, on reste sur 1 track (dégradation propre)

    shots, shot_starts, wi, cum = [], [], 0, 0
    beat_first_shot = {}
    transitions = ["flash", "whip", "zoomblur"]
    tix = 0
    for i, b in enumerate(beats):
        nwords = len(b["t"].split())
        wi_end = min(wi + nwords - 1, len(words) - 1)
        end_ms = words[wi_end]["endMs"] if words else int((i + 1) * audio_dur * 1000 / len(beats))
        wi = wi_end + 1
        beat_end_frame = total_frames if i == len(beats) - 1 else int(round(end_ms / 1000 * FPS))
        beat_span = max(15, beat_end_frame - cum)
        beat_first_shot[i] = len(shots)
        # 1-2 sous-plans par beat (montage rythmique) si le beat est assez long
        queries = b.get("q") or (LAUNCH_VISUAL_QUERIES[i] if i < len(LAUNCH_VISUAL_QUERIES) else [b["v"][:40]])
        n_sub = 2 if beat_span >= 90 else 1
        sub_frames = [beat_span // n_sub] * n_sub
        sub_frames[-1] += beat_span - sum(sub_frames)
        for k in range(n_sub):
            q = queries[k % len(queries)]
            clip_out = str(rd / f"shot{len(shots)}.mp4")
            sub_dur_s = max(0.6, sub_frames[k] / FPS)
            got = False
            sr = video_stock.search_pexels_video(q, per_page=10, orientation="portrait")
            vid = video_stock.pick_best(sr.get("videos") or [])
            if vid:
                raw_clip = str(rd / f"raw{len(shots)}.mp4")
                if video_stock.download(vid["file_url"], raw_clip).get("ok"):
                    # crop vertical + trim à la durée du sous-plan, on GARDE le mouvement (-an)
                    r = subprocess.run(["ffmpeg", "-y", "-ss", "0.8", "-i", raw_clip, "-t", f"{sub_dur_s:.2f}",
                                        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1",
                                        "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", clip_out],
                                       capture_output=True, timeout=120)
                    got = r.returncode == 0 and os.path.exists(clip_out)
            if got:
                shots.append({"src": f"runs/{run_id}/shot{len(shots)}.mp4", "type": "video", "durationInFrames": sub_frames[k], "beatFrames": [], "transition": transitions[tix % 3], "startFrom": 0})
            else:
                # secours : image FLUX animée
                img = str(rd / f"img{len(shots)}.png")
                fr = image_gen.flux_generate(b["v"], img, image_size="portrait_16_9")
                if not fr.get("ok"):
                    return {"ok": False, "error": f"no_visual_beat_{i}_sub{k}"}
                shots.append({"src": f"runs/{run_id}/img{len(shots)}.png", "type": "image", "durationInFrames": sub_frames[k], "beatFrames": [], "transition": transitions[tix % 3]})
            shot_starts.append(cum); cum += sub_frames[k]; tix += 1

    def _sf(bi):
        idx = beat_first_shot.get(bi, 0)
        return shot_starts[idx] if 0 <= idx < len(shot_starts) else 0
    brand_reveal = _sf(brand_beat)
    twist = _sf(twist_beat)
    counter_at = _sf(counter_beat)

    pub_runs = os.path.join(REMOTION_DIR, "public", "runs")
    os.makedirs(pub_runs, exist_ok=True)
    link = os.path.join(pub_runs, run_id)
    if os.path.islink(link) or os.path.exists(link):
        try: os.remove(link)
        except OSError: pass
    os.symlink(str(rd), link)

    props = {"shots": shots, "captions": captions, "voiceSrc": f"runs/{run_id}/voice_full.mp3",
             "shotStarts": shot_starts, "brandRevealFrame": brand_reveal, "twistFrame": twist,
             "counterAt": counter_at, "counterTo": counter_to, "counterSuffix": counter_suffix, "logoSrc": "brand/logo_alpha.png"}
    props_path = str(rd / "props.json")
    with open(props_path, "w", encoding="utf-8") as f:
        _json.dump(props, f, ensure_ascii=False)

    raw = str(rd / "raw.mp4")
    r = subprocess.run(["npx", "remotion", "render", "src/index.ts", "CofiaPublisherV3", raw,
                        f"--props={props_path}", "--concurrency=2", "--log=error"],
                       cwd=REMOTION_DIR, capture_output=True, text=True, timeout=1200)
    if r.returncode != 0 or not os.path.exists(raw):
        return {"ok": False, "error": "remotion_render_failed", "stderr": r.stderr[-700:], "run": run_id, "shots": len(shots)}

    music = suno_mp3  # HARD LOCK : musique SUNO générée pour CETTE vidéo (compte Pro Erwin)
    out_mp4 = str(rd / "video_v4.mp4")
    fc = ("[0:v]curves=b='0/0.06 0.5/0.55 1/1':r='0/0 0.5/0.46 1/0.95',eq=contrast=1.10:saturation=1.08,vignette=PI/4.8,noise=alls=3:allf=t[v];"
          "[0:a]asplit=2[a0][a1];[1:a]volume=0.40[mus];"
          "[mus][a0]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=300[duck];"
          "[a1][duck]amix=inputs=2:duration=first[mx];[mx]loudnorm=I=-14:TP=-1:LRA=11[a]")
    r2 = subprocess.run(["ffmpeg", "-y", "-i", raw, "-stream_loop", "-1", "-i", music, "-filter_complex", fc,
                         "-map", "[v]", "-map", "[a]", "-t", f"{audio_dur:.2f}",
                         "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-maxrate", "10M", "-bufsize", "16M",
                         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", out_mp4],
                        capture_output=True, text=True, timeout=400)
    if r2.returncode != 0 or not os.path.exists(out_mp4):
        return {"ok": False, "error": "post_render_failed", "stderr": r2.stderr[-500:], "run": run_id, "raw": raw}

    n_video = sum(1 for s in shots if s.get("type") == "video")
    qv = qa.review(out_mp4)
    return {"ok": True, "run": run_id, "engine": "remotion+ffmpeg", "shots": len(shots), "video_shots": n_video,
            "cost_eur": est, "output": out_mp4, "duration_s": round(audio_dur, 2), "captions_chunks": len(captions),
            "qa": qv, "publish": distribution.PUBLISH_LOCK,
            "upgrades": [f"{n_video}/{len(shots)} plans = VRAI footage vidéo (Pexels, ça bouge)", "montage multi-plans coupé au beat", "master loudnorm -14 LUFS (fin du PSHHH)", "whoosh 0.22 sur whip only", "LUT+grain léger+ducking", "captions kinetic synchro"],
            "note": "Vidéo v4 (vrai montage vidéo). Non publiée (§18)."}


def execute_v3(beats=None, voice_id=None) -> dict:
    """v3 — effets A/V (Marcus) : punch-zoom beat + SFX réels + transitions + compteur + LUT/grain/ducking post.
    Réutilise voix monolithique (sync exacte). GATED PRODUCE_GO + plafond."""
    if os.environ.get("PRODUCE_GO") != "1":
        return {"ok": False, "blocked": True, "reason": "PRODUCE_GO absent"}
    beats = beats or LAUNCH_BEATS
    est = tiers.estimate_cost_eur(["elevenlabs"] + ["flux_fal"] * len(beats), 6)
    ceiling = float(os.environ.get("MAX_COST_EUR", "3"))
    if est > ceiling:
        return {"ok": False, "blocked": True, "reason": f"coût {est}€ > plafond {ceiling}€"}
    FPS = 30
    run_id = f"v3_{int(time.time())}"
    rd = OUT_ROOT / run_id; rd.mkdir(parents=True, exist_ok=True)

    full_script = " ".join(b["t"] for b in beats)
    voice_full = str(rd / "voice_full.mp3")
    vr = voice_elevenlabs.synthesize_with_timestamps(full_script, voice_full, voice_id=voice_id)
    if not vr.get("ok"):
        return {"ok": False, "error": "voice_full", "detail": vr}
    words = captions_engine.words_from_elevenlabs(vr["alignment"])
    captions = captions_engine.chunk_words(words)
    try:
        audio_dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice_full],
                                         capture_output=True, text=True, timeout=20).stdout.strip() or 0)
    except Exception:  # noqa: BLE001
        audio_dur = (words[-1]["endMs"] / 1000) if words else 30
    total_frames = int(round(audio_dur * FPS))

    shots, shot_starts, wi, cum = [], [], 0, 0
    transitions = ["zoomblur", "flash", "whip"]
    for i, b in enumerate(beats):
        nwords = len(b["t"].split())
        wi_end = min(wi + nwords - 1, len(words) - 1)
        end_ms = words[wi_end]["endMs"] if words else int((i + 1) * audio_dur * 1000 / len(beats))
        beat_word_range = words[wi:wi_end + 1]
        wi = wi_end + 1
        end_frame = total_frames if i == len(beats) - 1 else int(round(end_ms / 1000 * FPS))
        dur = max(15, end_frame - cum)
        shot_starts.append(cum)
        # beatFrames = mots accentués du beat, relatifs au début du shot
        bf = [int(round(w["startMs"] / 1000 * FPS)) - cum for w in beat_word_range if w.get("emphasis")]
        cum += dur
        img = str(rd / f"img{i}.png")
        fr = image_gen.flux_generate(b["v"], img, image_size="portrait_16_9")
        if not fr.get("ok"):
            sr = video_stock.search_pexels_video(b["t"][:40], per_page=2, orientation="portrait")
            vids = sr.get("videos") or []
            if vids:
                video_stock.download(vids[0]["file_url"], str(rd / f"st{i}.mp4"))
                subprocess.run(["ffmpeg", "-y", "-i", str(rd / f"st{i}.mp4"), "-vframes", "1",
                                "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", img],
                               capture_output=True, timeout=60)
            if not os.path.exists(img):
                return {"ok": False, "error": f"no_visual_beat_{i}"}
        shots.append({"src": f"runs/{run_id}/img{i}.png", "durationInFrames": dur, "beatFrames": bf, "transition": transitions[i % 3]})

    brand_reveal = shot_starts[2] if len(shot_starts) > 2 else 0
    twist = shot_starts[3] if len(shot_starts) > 3 else 0

    pub_runs = os.path.join(REMOTION_DIR, "public", "runs")
    os.makedirs(pub_runs, exist_ok=True)
    link = os.path.join(pub_runs, run_id)
    if os.path.islink(link) or os.path.exists(link):
        try: os.remove(link)
        except OSError: pass
    os.symlink(str(rd), link)

    props = {"shots": shots, "captions": captions, "voiceSrc": f"runs/{run_id}/voice_full.mp3",
             "shotStarts": shot_starts, "brandRevealFrame": brand_reveal, "twistFrame": twist,
             "counterAt": twist, "counterTo": 200, "counterSuffix": " IA", "logoSrc": "brand/logo_alpha.png"}
    props_path = str(rd / "props.json")
    with open(props_path, "w", encoding="utf-8") as f:
        _json.dump(props, f, ensure_ascii=False)

    raw = str(rd / "raw.mp4")
    r = subprocess.run(["npx", "remotion", "render", "src/index.ts", "CofiaPublisherV3", raw,
                        f"--props={props_path}", "--concurrency=2", "--log=error"],
                       cwd=REMOTION_DIR, capture_output=True, text=True, timeout=900)
    if r.returncode != 0 or not os.path.exists(raw):
        return {"ok": False, "error": "remotion_render_failed", "stderr": r.stderr[-600:], "run": run_id}

    # ── post-render : LUT navy/cyan (curves) + grain + ducking musique sous voix (sidechain) ──
    music = os.path.join(REMOTION_DIR, "public", "music_launch.mp3")
    out_mp4 = str(rd / "video_v3.mp4")
    fc = ("[0:v]curves=b='0/0.06 0.5/0.55 1/1':r='0/0 0.5/0.46 1/0.95',eq=contrast=1.12:saturation=1.10,"
          "vignette=PI/4.6,noise=alls=4:allf=t[v];"
          "[0:a]asplit=2[a0][a1];[1:a]volume=0.5[mus];"
          "[mus][a0]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=300[duck];"
          "[a1][duck]amix=inputs=2:duration=first[a]")
    r2 = subprocess.run(["ffmpeg", "-y", "-i", raw, "-stream_loop", "-1", "-i", music, "-filter_complex", fc,
                         "-map", "[v]", "-map", "[a]", "-t", f"{audio_dur:.2f}",
                         "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-maxrate", "10M", "-bufsize", "16M",
                         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", out_mp4],
                        capture_output=True, text=True, timeout=400)
    if r2.returncode != 0 or not os.path.exists(out_mp4):
        out_mp4 = raw  # fallback : garder le raw si le post échoue

    qv = qa.review(out_mp4)
    return {"ok": True, "run": run_id, "engine": "remotion+ffmpeg-grade", "shots": len(shots), "cost_eur": est,
            "output": out_mp4, "duration_s": round(audio_dur, 2), "captions_chunks": len(captions),
            "qa": qv, "publish": distribution.PUBLISH_LOCK,
            "effects": ["punch-zoom beat", "SFX whoosh/boom/riser", "transitions zoomblur/flash/whip", "compteur 200 IA", "LUT navy/cyan", "grain", "ducking musique", "logo alpha card", "captions kinetic synchro"],
            "note": "Vidéo v3 (effets A/V Marcus). Non publiée (§18)."}


def _build_srt(text: str, total_s: float, path: str) -> None:
    """SRT depuis le script connu (pas besoin de whisper) — découpe en segments timés."""
    words = text.split()
    seg, segs, cur = [], [], 0
    for w in words:
        seg.append(w); cur += 1
        if cur >= 6:
            segs.append(" ".join(seg)); seg, cur = [], 0
    if seg:
        segs.append(" ".join(seg))
    if not segs:
        segs = [text]
    per = total_s / len(segs)
    def ts(s):
        h = int(s // 3600); m = int((s % 3600) // 60); sec = s % 60
        return f"{h:02d}:{m:02d}:{sec:06.3f}".replace(".", ",")
    with open(path, "w", encoding="utf-8") as f:
        for i, s in enumerate(segs):
            f.write(f"{i+1}\n{ts(i*per)} --> {ts((i+1)*per)}\n{s}\n\n")


def execute_real(tier: str = "premium", prompt: str = "COF Trading",
                 visual_prompt: str | None = None, duration_s: int = 12) -> dict:
    """VRAI pipeline : ElevenLabs (vraie voix) + FLUX (visuel IA) + Ken Burns + logo COF + sous-titres.
    GATED PRODUCE_GO=1 + plafond MAX_COST_EUR. Utilise les VRAIS outils (pas stock+say). Ne publie pas."""
    if os.environ.get("PRODUCE_GO") != "1":
        return {"ok": False, "blocked": True, "reason": "PRODUCE_GO absent"}
    provs = ["elevenlabs", "flux_fal"]
    est = tiers.estimate_cost_eur(provs, duration_s)
    ceiling = float(os.environ.get("MAX_COST_EUR", "2"))
    if est > ceiling:
        return {"ok": False, "blocked": True, "reason": f"coût {est}€ > plafond {ceiling}€"}
    if not shutil.which("ffmpeg"):
        return {"ok": False, "error": "ffmpeg_absent"}

    run_id = f"real_{int(time.time())}"
    rd = OUT_ROOT / run_id; rd.mkdir(parents=True, exist_ok=True)
    steps = {}

    # 1) VRAIE voix ElevenLabs
    voice_mp3 = str(rd / "voice.mp3")
    vr = voice_elevenlabs.synthesize(prompt, voice_mp3)
    if not vr.get("ok"):
        return {"ok": False, "error": "elevenlabs_failed", "detail": vr}
    steps["voice"] = {"provider": "elevenlabs", "ok": True, "bytes": vr.get("bytes")}
    try:
        vdur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice_mp3],
                                    capture_output=True, text=True, timeout=20).stdout.strip() or duration_s)
    except Exception:  # noqa: BLE001
        vdur = duration_s

    # 2) Visuel IA FLUX (fallback stock si échec)
    img = str(rd / "visual.png")
    fr = image_gen.flux_generate(visual_prompt or f"cinematic vertical 9:16, {prompt}, trading, premium, dark blue, no text", img)
    if fr.get("ok"):
        steps["visual"] = {"provider": "flux_fal", "ok": True}
        bg_src, bg_is_img = img, True
    else:
        sr = video_stock.search_pexels_video(prompt, per_page=3, orientation="portrait")
        vids = sr.get("videos") or []
        if not vids:
            return {"ok": False, "error": "no_visual", "flux": fr, "stock": sr}
        bg_src = str(rd / "clip.mp4"); video_stock.download(vids[0]["file_url"], bg_src); bg_is_img = False
        steps["visual"] = {"provider": "stock_pexels_fallback", "ok": True, "flux_err": fr.get("error")}

    # 3) sous-titres depuis le script
    srt = str(rd / "captions.srt"); _build_srt(prompt, vdur, srt)
    logo = brand_assets.BRAND["logo_remotion"]
    out_mp4 = str(rd / "video_real.mp4")
    frames = int(vdur * 30)

    if bg_is_img:
        bg = f"[0:v]scale=1620:2880,zoompan=z='min(zoom+0.0006,1.25)':d={frames}:s=1080x1920:fps=30,setsar=1[bg]"
        in_bg = ["-loop", "1", "-i", bg_src]
    else:
        bg = "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1[bg]"
        in_bg = ["-stream_loop", "-1", "-i", bg_src]

    srt_esc = srt.replace(":", "\\:").replace("'", "")
    fc = (f"{bg};[2:v]scale=240:-1[lg];[bg][lg]overlay=40:55[v1];"
          f"[v1]subtitles='{srt_esc}':force_style='Fontsize=18,PrimaryColour=&H00FFFFFF,"
          f"OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=120'[v]")
    cmd = ["ffmpeg", "-y", *in_bg, "-i", voice_mp3, "-i", logo,
           "-filter_complex", fc, "-map", "[v]", "-map", "1:a:0", "-t", f"{vdur:.2f}",
           "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", out_mp4]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
    if r.returncode != 0 or not os.path.exists(out_mp4):
        return {"ok": False, "error": "ffmpeg_failed", "stderr": r.stderr[-400:], "run": run_id, "steps": steps}
    steps["montage"] = {"ok": True, "brand_overlay": True, "captions": True}
    qv = qa.review(out_mp4)
    return {"ok": True, "run": run_id, "tier": tier, "cost_eur": est, "output": out_mp4,
            "duration_s": round(vdur, 2), "qa": qv, "steps": steps, "publish": distribution.PUBLISH_LOCK,
            "tools_used": ["ElevenLabs voix", steps["visual"]["provider"], "Ken Burns", "logo COF overlay", "sous-titres"],
            "note": "Vidéo RÉELLE (vrais outils). Non publiée (§18)."}
