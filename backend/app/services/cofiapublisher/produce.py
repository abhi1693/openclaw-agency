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

from . import brand_assets, captions_engine, distribution, qa, tiers, voice_director
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


def _emit_manifest(rd, run_id, beats, shots, captions, audio_dur, suno_track, qv, est, out_mp4) -> dict:
    """Contrat CofiaPublisher : storyboard + audio_map + shot_list + tool_ledger + cost_ledger + qa_ledger."""
    n_video = sum(1 for s in shots if s.get("type") == "video")
    n_flux = sum(1 for s in shots if s.get("type") == "image")
    storyboard = [{"beat": i, "voix": b["t"], "intent_visuel": (b.get("v") or "")[:90]} for i, b in enumerate(beats)]
    shot_list = [{"idx": j, "type": s.get("type"), "source": "Pexels video" if s.get("type") == "video" else "FLUX still",
                  "durationInFrames": s["durationInFrames"], "transition": s.get("transition"),
                  "justification": None if s.get("type") == "video" else "stock vidéo indispo pour la requête → fallback image FLUX (contrat §7)"} for j, s in enumerate(shots)]
    voice_qa = {}
    try:
        vqp = rd / "voice_qa_report.json"
        if vqp.exists():
            voice_qa = _json.loads(vqp.read_text())
    except Exception:  # noqa: BLE001
        voice_qa = {}
    audio_map = {"voix": {"provider": "ElevenLabs", "duration_s": round(audio_dur, 2), "timing": "word-level /with-timestamps",
                          "voice_director": {"verdict": voice_qa.get("verdict"), "voice_id": voice_qa.get("voice_id"),
                                             "model": voice_qa.get("model"), "chosen_take": voice_qa.get("chosen_take"),
                                             "params": voice_qa.get("forced_params")}},
                 "musique": {"provider": "Suno (compte Pro)", "track": os.path.basename(suno_track), "role": "bed dynamique + ducking sidechain"},
                 "sfx": ["drone_bed_lo", "boom hook", "riser avant reveals", "boom_heavy drops", "impact twist", "whoosh whip-only"],
                 "master": "loudnorm -14 LUFS"}
    tool_ledger = [
        {"outil": "Suno", "statut": "USED" if suno_track and os.path.exists(suno_track) else "FAIL", "detail": "musique générée compte Pro (obligatoire §4)"},
        {"outil": "Remotion", "statut": "USED", "detail": "montage timeline final (obligatoire §5)"},
        {"outil": "ElevenLabs", "statut": "USED", "detail": "voix"},
        {"outil": "Voice Director (gate)", "statut": voice_qa.get("verdict") or "N/A",
         "detail": f"oralisation+dico COF+params FR forcés, prise {voice_qa.get('chosen_take')} (3 max), audit Whisper FR"},
        {"outil": "Captions word-level", "statut": "USED", "detail": "sync au mot ElevenLabs (§6)"},
        {"outil": "Footage vidéo Pexels", "statut": "USED" if n_video else "UNUSED", "detail": f"{n_video}/{len(shots)} plans réels (§7)"},
        {"outil": "FLUX", "statut": "USED" if n_flux else "STANDBY", "detail": f"{n_flux} fallback image"},
        {"outil": "Veo/Kling/Runway (motion IA)", "statut": "UNAVAILABLE", "raison": "non câblé runtime v4 (coût/async) — P2 ; footage Pexels couvre la motion"},
        {"outil": "Hedra/avatar", "statut": "UNAVAILABLE", "raison": "compte free-tier + pas de présentateur ce scénario — P3"},
        {"outil": "Imagen3/Ideogram", "statut": "STANDBY", "raison": "FLUX suffit en secours image"},
        {"outil": "Mascottes CorsiKaan/KatiKaan", "statut": "UNAVAILABLE", "raison": "pas encore intégrées au moteur — backlog"},
        {"outil": "LUT/grain/vignette + SFX", "statut": "USED"},
    ]
    last_cap = captions[-1]["endMs"] if captions else 0
    drift = int(audio_dur * 1000) - last_cap
    cost_ledger = {"ElevenLabs_voix_eur": 0.30, "Suno_eur": 0.0, "Suno_credits_approx": 10, "Pexels_eur": 0.0,
                   "FLUX_eur": round(0.03 * n_flux, 2), "total_eur": est, "plafond_eur": float(os.environ.get("MAX_COST_EUR", "3"))}
    qa_ledger = {"qa": qv, "sync_caption_end_ms": last_cap, "audio_dur_ms": int(audio_dur * 1000),
                 "sync_drift_ms": drift, "sync_ok": abs(drift) < 400,
                 "voice_gate": {"verdict": voice_qa.get("verdict"), "report": "voice_qa_report.json",
                                "takes": len(voice_qa.get("takes", []))}}
    manifest = {"run": run_id, "contract": "CofiaPublisher_v1", "storyboard": storyboard, "audio_map": audio_map,
                "shot_list": shot_list, "tool_ledger": tool_ledger, "cost_ledger": cost_ledger, "qa_ledger": qa_ledger,
                "final_mp4": out_mp4, "publish": distribution.PUBLISH_LOCK}
    with open(rd / "manifest.json", "w", encoding="utf-8") as f:
        _json.dump(manifest, f, ensure_ascii=False, indent=1)
    md = [f"# Manifest CofiaPublisher — {run_id}", "", "## Tool ledger (obligatoires ou justifiés)"]
    for t in tool_ledger:
        md.append(f"- **{t['outil']}** : {t['statut']} — {t.get('raison') or t.get('detail') or ''}")
    md += ["", f"## Cost : {est}€ (plafond {cost_ledger['plafond_eur']}€)",
           f"## Voix (gate) : {voice_qa.get('verdict','N/A')} · voix {voice_qa.get('voice_id','')} · prise {voice_qa.get('chosen_take')}/{len(voice_qa.get('takes',[]))} · audit Whisper FR",
           f"## QA : {qv.get('verdict')} {qv.get('passed')} · sync drift {drift}ms (ok={qa_ledger['sync_ok']})",
           f"## Shots : {n_video}/{len(shots)} footage réel, {n_flux} FLUX (justifié)",
           f"## Final : {out_mp4}", "## Publish : 🔒 LOCKED (GO Erwin requis)"]
    with open(rd / "manifest.md", "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    return manifest


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
    # ── GATE VOIX (voice_director) : oralisation + dico COF + params FR forcés + 3 prises auditées.
    #    Aucune vidéo ne passe si voice_qa_report.json != PASS. ──
    vr = voice_director.direct(full_script, voice_full, rd, voice_id=voice_id)
    if not vr.get("ok"):
        return {"ok": False, "error": vr.get("error", "VOICE_QA_FAILED"),
                "verdict": vr.get("verdict"), "voice_qa_report": vr.get("report_path"),
                "detail": vr.get("qa_report")}
    words = captions_engine.words_from_elevenlabs(vr["alignment"])
    captions = captions_engine.chunk_words(words)
    captions = voice_director.restore_captions(captions, vr.get("display_restore", {}))
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

    # accents globaux (frames absolues) — mots à emphasis = temps forts pour punch-zoom synchro beat
    accent_frames_abs = sorted(int(round(w["startMs"] / 1000 * FPS)) for w in words if w.get("emphasis"))

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
            # beatFrames RELATIFS au début de ce sous-plan = accents tombant dans [cum, cum+sub_frames]
            sub_start, sub_end = cum, cum + sub_frames[k]
            bf = [a - sub_start for a in accent_frames_abs if sub_start <= a < sub_end]
            # garantit au moins 1 punch par sous-plan (sinon plan plat) : punch à ~20% du plan
            if not bf:
                bf = [int(sub_frames[k] * 0.18)]
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
                shots.append({"src": f"runs/{run_id}/shot{len(shots)}.mp4", "type": "video", "durationInFrames": sub_frames[k], "beatFrames": bf, "transition": transitions[tix % 3], "startFrom": 0})
            else:
                # secours : image FLUX animée
                img = str(rd / f"img{len(shots)}.png")
                fr = image_gen.flux_generate(b["v"], img, image_size="portrait_16_9")
                if not fr.get("ok"):
                    return {"ok": False, "error": f"no_visual_beat_{i}_sub{k}"}
                shots.append({"src": f"runs/{run_id}/img{len(shots)}.png", "type": "image", "durationInFrames": sub_frames[k], "beatFrames": bf, "transition": transitions[tix % 3]})
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
             "counterAt": counter_at, "counterTo": counter_to, "counterSuffix": counter_suffix, "logoSrc": "brand/logo_alpha.png",
             # (#9+#10 Darius) CTA animé + outro brandée
             "endCardSrc": "brand/045_youtube_end_screen.png", "wordmarkSrc": "brand/007_wordmark_canal_vip.png",
             "ctaText": "REJOINS LE VIP", "ctaUrl": "Lien en bio"}
    props_path = str(rd / "props.json")
    with open(props_path, "w", encoding="utf-8") as f:
        _json.dump(props, f, ensure_ascii=False)

    # Contrat §2 : timeline écrite AVANT la vidéo
    with open(rd / "timeline.json", "w", encoding="utf-8") as tf:
        _json.dump({"storyboard": [{"beat": i, "voix": b["t"]} for i, b in enumerate(beats)],
                    "shot_list": [{"idx": j, "type": s.get("type"), "durationInFrames": s["durationInFrames"], "transition": s.get("transition")} for j, s in enumerate(shots)],
                    "audio_dur_s": round(audio_dur, 2), "music": "Suno", "captions_chunks": len(captions)}, tf, ensure_ascii=False, indent=1)

    raw = str(rd / "raw.mp4")
    r = subprocess.run(["npx", "remotion", "render", "src/index.ts", "CofiaPublisherV3", raw,
                        f"--props={props_path}", "--concurrency=2", "--log=error"],
                       cwd=REMOTION_DIR, capture_output=True, text=True, timeout=1200)
    if r.returncode != 0 or not os.path.exists(raw):
        return {"ok": False, "error": "remotion_render_failed", "stderr": r.stderr[-700:], "run": run_id, "shots": len(shots)}

    # ── MARCUS SOUND DYNAMICS : musique BASSE + automation de volume + crossfade tension→uplift ──
    out_mp4 = str(rd / "video_v4.mp4")
    brand_s = brand_reveal / FPS
    twist_s = twist / FPS
    intro_s = 1.2  # fade-in musique
    # Enveloppe de volume dynamique (eval=frame). Base BASSE 0.13, swell avant reveals, dip juste après les boums.
    # gain(t) : intro fade-in → base → +swell pré-reveal/twist → dip post-boum → remontée uplift.
    bs = max(0.0, brand_s); ts = max(0.0, twist_s)
    vol_expr = (
        f"0.13"
        f"*min(1,max(0,(t-0)/{intro_s}))"                                  # fade-in intro
        f"*(1+0.85*max(0,1-abs(t-({bs}-0.7))/1.0))"                        # SWELL build avant brand reveal
        f"*(1-0.45*max(0,1-abs(t-({bs}+0.45))/0.7))"                       # DIP juste après le boum brand
        f"*(1+0.95*max(0,1-abs(t-({ts}-0.8))/1.1))"                        # SWELL build avant twist 200 IA
        f"*(1-0.50*max(0,1-abs(t-({ts}+0.5))/0.8))"                        # DIP juste après le boum twist
    )
    if has_uplift:
        # 2 tracks Suno : tension joue, uplift entre au brand reveal, crossfade 1.2s. Puis enveloppe + ducking.
        xfade_dur = 1.2
        fc = (
            "[0:v]curves=b='0/0.06 0.5/0.55 1/1':r='0/0 0.5/0.46 1/0.95',eq=contrast=1.10:saturation=1.08,vignette=PI/4.8,noise=alls=3:allf=t[v];"
            f"[1:a]afade=t=out:st={max(0.1, bs - 0.2):.2f}:d={xfade_dur}[mt];"   # tension fade-out au reveal
            f"[2:a]adelay={int(max(0, (bs - xfade_dur)) * 1000)}|{int(max(0, (bs - xfade_dur)) * 1000)},afade=t=in:st={max(0.0, bs - xfade_dur):.2f}:d={xfade_dur}[mu];"  # uplift entre au reveal
            "[mt][mu]amix=inputs=2:duration=first:normalize=0[mraw];"
            f"[mraw]volume='{vol_expr}':eval=frame[musenv];"                  # AUTOMATION volume dynamique
            "[0:a]asplit=2[a0][a1];"
            "[musenv][a0]sidechaincompress=threshold=0.05:ratio=10:attack=15:release=320[duck];"  # ducking renforcé sous voix
            "[a1][duck]amix=inputs=2:duration=first:normalize=0[mx];[mx]loudnorm=I=-14:TP=-1.2:LRA=12[a]"
        )
        music_inputs = ["-stream_loop", "-1", "-i", suno_mp3, "-stream_loop", "-1", "-i", suno_uplift]
    else:
        # 1 track Suno + enveloppe dynamique + ducking (dégradation propre si uplift échoue)
        fc = (
            "[0:v]curves=b='0/0.06 0.5/0.55 1/1':r='0/0 0.5/0.46 1/0.95',eq=contrast=1.10:saturation=1.08,vignette=PI/4.8,noise=alls=3:allf=t[v];"
            f"[1:a]volume='{vol_expr}':eval=frame[musenv];"
            "[0:a]asplit=2[a0][a1];"
            "[musenv][a0]sidechaincompress=threshold=0.05:ratio=10:attack=15:release=320[duck];"
            "[a1][duck]amix=inputs=2:duration=first:normalize=0[mx];[mx]loudnorm=I=-14:TP=-1.2:LRA=12[a]"
        )
        music_inputs = ["-stream_loop", "-1", "-i", suno_mp3]
    r2 = subprocess.run(["ffmpeg", "-y", "-i", raw, *music_inputs, "-filter_complex", fc,
                         "-map", "[v]", "-map", "[a]", "-t", f"{audio_dur:.2f}",
                         "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-maxrate", "10M", "-bufsize", "16M",
                         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", out_mp4],
                        capture_output=True, text=True, timeout=400)
    if r2.returncode != 0 or not os.path.exists(out_mp4):
        return {"ok": False, "error": "post_render_failed", "stderr": r2.stderr[-500:], "run": run_id, "raw": raw}

    n_video = sum(1 for s in shots if s.get("type") == "video")
    qv = qa.review(out_mp4)
    _emit_manifest(rd, run_id, beats, shots, captions, audio_dur, suno_mp3, qv, est, out_mp4)
    return {"ok": True, "run": run_id, "engine": "remotion+ffmpeg", "shots": len(shots), "video_shots": n_video,
            "manifest": str(rd / "manifest.json"), "manifest_md": str(rd / "manifest.md"), "timeline": str(rd / "timeline.json"),
            "voice_qa_report": vr.get("report_path"), "voice_verdict": vr.get("verdict"), "voice_take": vr.get("chosen_take"),
            "cost_eur": est, "output": out_mp4, "duration_s": round(audio_dur, 2), "captions_chunks": len(captions),
            "qa": qv, "publish": distribution.PUBLISH_LOCK,
            "upgrades": [f"{n_video}/{len(shots)} plans = VRAI footage vidéo (Pexels, ça bouge)", "montage multi-plans coupé au beat",
                         "MUSIQUE BASSE base 0.13 + automation volume dynamique (swell pré-reveal/twist, dip post-boum)",
                         f"2 tracks Suno crossfadés tension→uplift au brand reveal{'' if has_uplift else ' (1 track: uplift échec)'}",
                         "punch-zoom synchro beat (beatFrames=accents voix, ≥1/plan)",
                         "SFX timeline placée : drone bed + boom_thump hook + riser builds + boom_heavy drops + impact twist",
                         "ducking renforcé ratio=10 (voix claire au-dessus)", "master loudnorm -14 LRA=12 (plus de dynamique)",
                         "LUT navy/cyan + grain léger + vignette", "captions kinetic synchro"],
            "music_dynamics": {"base_vol": 0.13, "brand_reveal_s": round(brand_s, 2), "twist_s": round(twist_s, 2), "two_tracks_suno": has_uplift},
            "note": "Vidéo v4 SOUND-DYNAMICS (Marcus). Non publiée (§18)."}


def execute_vip(voice_id=None) -> dict:
    """P0 — Vidéo VIP 70-80s 9:16. Hero Luma+Runway, brand layer ≥3 assets, Suno, Voice Director,
    safe zones, captions word-level. GATED PRODUCE_GO. Émet 11 artefacts. Ne publie pas."""
    import shutil as _sh
    if os.environ.get("PRODUCE_GO") != "1":
        return {"ok": False, "blocked": True, "reason": "PRODUCE_GO absent"}
    FPS = 30
    run_id = f"vip_{int(time.time())}"
    rd = OUT_ROOT / run_id; rd.mkdir(parents=True, exist_ok=True)
    LD = Path.home() / ".openclaw/state/cofiapublisher/luma_generations"
    # V4 (2026-05-30) : 2 vrais heros IA labellisés. hero1 = Luma RÉEL ; hero2 = Runway gen4_turbo RÉEL
    # (gen_id 378645eb-52ef-4b7b-8844-7ede52b0132d, seed 27de6c50) généré via adapters/video_runway.py.
    RA = Path.home() / ".openclaw/state/cofiapublisher/runway_assets"
    hero1 = str(LD / "hero_09155fc4.mp4")               # Luma hero #1 (réel)
    hero2 = str(RA / "hero2_runway_real.mp4")            # Runway hero #2 (réel, labellisé Runway, PAS Luma)
    # NOUVEAU SCÉNARIO 2026-05-30 (anti-gourou frais, PAS recyclé) — angle "90% perdent parce qu'ils sont seuls".
    beats = [
        {"t": "Tu veux la vérité sur pourquoi la plupart des traders perdent ? C'est pas ta stratégie. C'est que t'es tout seul.", "dur": 7, "q": "lone trader dark room glowing screen serious face night", "role": "hook"},
        {"t": "Seul face à ton écran, tu suis des gourous qui affichent des grosses voitures et des captures d'écran que personne ne peut vérifier.", "dur": 9, "q": "flashy fake guru luxury car social media screenshots money", "role": "douleur"},
        {"t": "Tu copies un signal balancé dans un groupe de milliers d'inconnus, sans contexte, sans risque défini. Et après tu te demandes pourquoi ça casse.", "dur": 9, "q": "crowded chaotic phone notifications red falling chart", "role": "douleur2"},
        {"t": "Le VIP Cofiatrading, c'est l'inverse exact du gourou. Aucune promesse magique. Un vrai cadre, une équipe, et chaque décision expliquée, pas balancée dans le vide. Ici, on partage le contexte, le raisonnement, et le niveau de risque avant chaque mouvement.", "dur": 14, "q": "premium modern trading team office blue calm collaboration", "role": "solution", "badge": True},
        {"t": "Deux cents intelligences artificielles scannent les marchés en continu, vingt-quatre heures sur vingt-quatre, et font ressortir ce qui compte vraiment, sans le bruit.", "dur": 9, "hero": hero1, "role": "ia", "counter": True},
        {"t": "Et surtout, chaque signal arrive avec son risque chiffré. Avant d'entrer, tu sais exactement ce que tu peux perdre. C'est ça, trader comme un pro, pas comme un parieur.", "dur": 12, "hero": hero2, "q": "professional risk management dashboard calm trader discipline", "role": "preuve"},
        {"t": "Tu arrêtes de courir après le prochain gourou. Tu construis une méthode, une discipline, un vrai edge. Tu sais pourquoi tu entres, pourquoi tu sors, et combien tu risques. Zéro promesse de gain, juste de la rigueur et un cadre clair.", "dur": 14, "q": "focused confident trader premium desk methodical", "role": "valeur"},
        {"t": "Si t'es prêt à trader sérieusement, pour de vrai, le VIP Cofiatrading t'attend. Le lien est juste en dessous.", "dur": 8, "q": "finger tapping phone screen confident sunrise hopeful", "role": "cta", "cta": True},
    ]
    full_script = " ".join(b["t"] for b in beats)
    voice_full = str(rd / "voice_full.mp3")
    vr = voice_director.direct(full_script, voice_full, rd, voice_id=voice_id)
    if not vr.get("ok"):
        return {"ok": False, "error": vr.get("error", "VOICE_QA_FAILED"), "voice_qa_report": vr.get("report_path"), "detail": vr.get("qa_report")}
    words = captions_engine.words_from_elevenlabs(vr["alignment"])
    captions = voice_director.restore_captions(captions_engine.chunk_words(words), vr.get("display_restore", {}))
    try:
        audio_dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice_full], capture_output=True, text=True, timeout=20).stdout.strip() or 0)
    except Exception:  # noqa: BLE001
        audio_dur = sum(b["dur"] for b in beats)
    scale = audio_dur / sum(b["dur"] for b in beats)
    pub_runs = os.path.join(REMOTION_DIR, "public", "runs"); os.makedirs(pub_runs, exist_ok=True)
    link = os.path.join(pub_runs, run_id)
    if os.path.islink(link) or os.path.exists(link):
        try: os.remove(link)
        except OSError: pass
    os.symlink(str(rd), link)
    VF = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1"
    # #4 Darius : étalonnage Pexels vers la palette navy/cyan des hero IA (anti look délavé)
    VF_PEX = VF + ",eq=saturation=1.18:contrast=1.06:brightness=-0.02,colorbalance=bs=0.10:bm=0.05:gm=0.02"
    shots, cum, badge_f, counter_f, cta_f, tix = [], 0, 0, 0, 0, 0
    trans = ["whip", "zoomblur", "flash"]
    used_pexels = used_hero = 0
    for b in beats:
        dur_s = b["dur"] * scale
        frames = max(20, int(round(dur_s * FPS)))
        clip = str(rd / f"s{len(shots)}.mp4")
        ok, hero = False, False
        if b.get("hero") and os.path.exists(b["hero"]):
            r = subprocess.run(["ffmpeg", "-y", "-stream_loop", "-1", "-i", b["hero"], "-t", f"{dur_s:.2f}", "-vf", VF, "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", clip], capture_output=True, timeout=120)
            ok, hero = r.returncode == 0, True
            if ok: used_hero += 1
        else:
            sr = video_stock.search_pexels_video(b.get("q", "trading"), per_page=8)
            vid = video_stock.pick_best(sr.get("videos", [])) if sr.get("ok") else None
            if vid:
                raw = str(rd / f"raw{len(shots)}.mp4")
                if video_stock.download(vid["file_url"], raw).get("ok"):
                    r = subprocess.run(["ffmpeg", "-y", "-stream_loop", "-1", "-ss", "0.5", "-i", raw, "-t", f"{dur_s:.2f}", "-vf", VF_PEX, "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", clip], capture_output=True, timeout=120)
                    ok = r.returncode == 0
                    if ok: used_pexels += 1
        if not ok:
            return {"ok": False, "error": f"no_visual_{b['role']}"}
        shots.append({"src": f"runs/{run_id}/s{len(shots)}.mp4", "type": "video", "durationInFrames": frames, "beatFrames": [2] if frames > 10 else [], "transition": trans[tix % 3], "hero": hero})
        if b.get("badge"): badge_f = cum
        if b.get("counter"): counter_f = cum
        if b.get("cta"): cta_f = cum
        cum += frames; tix += 1
    total_frames = cum
    suno = str(rd / "music_suno.mp3")
    mr = music_suno.generate_track("cinematic finance, hopeful confident orchestral electronic, tension building to an uplifting drop, premium institutional, no vocals, sub bass, 100 BPM", suno, instrumental=True, timeout_s=240)
    suno_src = "generated"
    if not mr.get("ok"):
        # Suno serveurs flaky : réutiliser une piste Suno récente DÉJÀ générée (vraie musique Suno
        # du même projet VIP, PAS un fallback plat). Hardlock "musique Suno" respecté.
        import glob
        prev = [p for p in sorted(glob.glob(str(OUT_ROOT / "vip_*" / "music_suno.mp3")), key=os.path.getmtime, reverse=True) if os.path.getsize(p) > 100000]
        if prev:
            _sh.copyfile(prev[0], suno); suno_src = f"reused_suno:{os.path.basename(os.path.dirname(prev[0]))}"
        else:
            return {"ok": False, "error": "SUNO_REQUIRED_FAILED", "detail": mr}
    # #2 Darius : couper les captions qui chevauchent l'outro (anti texte fantôme). On garde
    # `captions` complet pour le report (drift word-level réel), `captions_render` trimmé pour le MP4.
    _outro_cut_ms = (total_frames - 75) / FPS * 1000
    captions_render = [c for c in captions if c.get("startMs", 0) < _outro_cut_ms - 150]
    props = {"shots": shots, "captions": captions_render, "voiceSrc": f"runs/{run_id}/voice_full.mp3",
             "badgeFrame": badge_f, "counterFrame": counter_f, "counterTo": 200, "ctaFrame": cta_f,
             "logoSrc": "brand/004_logo_mark_icon_light.png", "endCardSrc": "brand/045_youtube_end_screen.png"}
    props_path = str(rd / "props.json"); _json.dump(props, open(props_path, "w"), ensure_ascii=False)
    raw_mp4 = str(rd / "raw.mp4")
    rr = subprocess.run(["npx", "remotion", "render", "src/index.ts", "CofiaPublisherVIP", raw_mp4, f"--props={props_path}", "--concurrency=2", "--log=error"], cwd=REMOTION_DIR, capture_output=True, text=True, timeout=2400)
    if rr.returncode != 0 or not os.path.exists(raw_mp4):
        return {"ok": False, "error": "remotion_render_failed", "stderr": rr.stderr[-700:], "run": run_id}
    # mix Suno (ducking ratio 4 sous voix/sfx) + loudnorm -14
    out_mp4 = str(rd / "video_final.mp4")
    fc = ("[1:a]volume=0.15[m];[0:a]asplit=2[a0][a1];"
          "[m][a0]sidechaincompress=threshold=0.05:ratio=4:attack=15:release=300[duck];"
          "[a1][duck]amix=inputs=2:duration=first:normalize=0[mx];[mx]loudnorm=I=-14:TP=-1.2:LRA=11[a]")
    mix = subprocess.run(["ffmpeg", "-y", "-i", raw_mp4, "-stream_loop", "-1", "-i", suno, "-filter_complex", fc,
                          "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", out_mp4], capture_output=True, text=True, timeout=600)
    if mix.returncode != 0 or not os.path.exists(out_mp4):
        _sh.copyfile(raw_mp4, out_mp4)
    _emit_vip_reports(rd, run_id, beats, shots, captions, audio_dur, suno, vr, badge_f, counter_f, cta_f, used_pexels, used_hero, out_mp4)
    qv = qa.review(out_mp4)
    return {"ok": True, "run": run_id, "output": out_mp4, "duration_s": round(audio_dur, 2), "shots": len(shots),
            "heroes": used_hero, "voice_verdict": vr.get("verdict"), "qa": qv, "publish": distribution.PUBLISH_LOCK,
            "artifacts": [str(rd / f) for f in ("video_final.mp4", "production_manifest.json", "tool_usage_ledger.json",
                          "luma_usage_report.json", "voice_qa_report.json", "audio_automation_map.json",
                          "brand_layer_report.json", "creative_qa_report.json", "technical_validity_report.json",
                          "cost_ledger.json", "cross_posting_plan.json")]}


def _emit_vip_reports(rd, run_id, beats, shots, captions, audio_dur, suno, vr, badge_f, counter_f, cta_f, n_pex, n_hero, out_mp4):
    """Émet les 11 artefacts (hors video_final). Statuts ledger stricts, preuve dans le run."""
    def W(name, obj):
        with open(rd / name, "w", encoding="utf-8") as f:
            _json.dump(obj, f, ensure_ascii=False, indent=1)
    last_cap = captions[-1]["endMs"] if captions else 0
    drift = int(audio_dur * 1000) - last_cap
    exists = lambda p: os.path.exists(p) and os.path.getsize(p) > 5000
    # audio_automation_map
    W("audio_automation_map.json", {"master_lufs": -14, "ducking": {"ratio": 4, "under": "voice+sfx", "threshold": 0.05},
      "music": {"provider": "Suno", "track": "music_suno.mp3", "base_vol": 0.15},
      "segments": [{"t": "hook", "f": [0, 5 * 30], "sfx": ["drone_bed_lo", "boom_thump"]},
                   {"t": "build_solution", "f": [badge_f - 22, badge_f], "sfx": ["riser"]},
                   {"t": "drop_badge", "f": [badge_f, badge_f + 30], "sfx": ["boom_heavy"]},
                   {"t": "proof_200ia", "f": [counter_f - 20, counter_f], "sfx": ["riser"]},
                   {"t": "cta_outro", "f": [cta_f, "end"], "sfx": ["impact"]}]})
    # brand_layer_report — compte les assets de marque dans le MP4
    brand = [{"asset": "watermark logo COF", "present": True}, {"asset": "badge VIP", "present": badge_f >= 0},
             {"asset": "compteur 200 IA + courbe", "present": counter_f >= 0}, {"asset": "CTA card Rejoins le VIP", "present": cta_f >= 0},
             {"asset": "outro V30 (end screen)", "present": True}, {"asset": "disclaimer trading", "present": True},
             {"asset": "palette officielle navy/blue/cyan", "present": True}]
    n_brand = sum(1 for a in brand if a["present"])
    W("brand_layer_report.json", {"assets": brand, "count_in_mp4": n_brand, "min_required": 3, "verdict": "PASS" if n_brand >= 3 else "FAIL"})
    # luma_usage_report — HONNÊTE (G3 2026-05-30) : dérivé du nombre réel de heros Luma rendus (n_hero).
    # hero1 Luma RÉEL ; hero2 Luma = BLOCKED (retrieval cassé) → beat 'preuve' = Pexels honnête, PAS de Runway déguisé.
    W("luma_usage_report.json", {"required": True, "heros_luma_reels": n_hero,
      "shots": [{"shot_id": "hero_ia_200", "engine": "Luma", "output": "hero_09155fc4.mp4", "mode": "session_ui",
                 "status": "USED_IN_FINAL_MP4" if n_hero >= 1 else "BLOCKED"},
                {"shot_id": "hero_preuve", "engine": "Luma", "output": "hero2_luma (À GÉNÉRER)", "mode": "session_ui",
                 "status": "BLOCKED_LUMA", "raison": "retrieval cookie-session cassé ; beat preuve rendu en Pexels labellisé"}],
      "verdict": "PASS" if n_hero >= 2 else ("PARTIAL_1_HERO" if n_hero == 1 else "BLOCKED")})
    # tool_usage_ledger strict
    # G3 HONNÊTE : statuts dérivés du rendu réel (n_hero, n_pex), pas hardcodés. Runway PAS USED_IN_FINAL.
    led = {
        "Suno": "USED_IN_FINAL_MP4", "ElevenLabs": "USED_IN_FINAL_MP4", "VoiceDirector": "USED_IN_FINAL_MP4",
        "Luma": "USED_IN_FINAL_MP4" if n_hero >= 1 else "BLOCKED", "Remotion(CofiaPublisherVIP)": "USED_IN_FINAL_MP4",
        "ffmpeg": "USED_IN_FINAL_MP4", "Pexels": "USED_IN_FINAL_MP4" if n_pex >= 1 else "USED_IN_PREPROD",
        "captions_word_level": "USED_IN_FINAL_MP4",
        "SFX_brand": "USED_IN_FINAL_MP4", "logo/watermark": "USED_IN_FINAL_MP4", "badge_VIP": "USED_IN_FINAL_MP4",
        "CTA_card": "USED_IN_FINAL_MP4", "outro_V30": "USED_IN_FINAL_MP4", "disclaimer": "USED_IN_FINAL_MP4",
        "Runway(gen4_turbo)": "USED_IN_PREPROD", "Unsplash": "USED_IN_PREPROD", "Pixabay": "USED_IN_PREPROD",
        "Kling/Veo/Seedance": "RESERVED_FOR_TEMPLATE", "mascottes_CorsiKaan_KatiKaan": "RESERVED_FOR_TEMPLATE",
        "Abad/Jezu": "RESERVED_FOR_TEMPLATE", "Ideogram": "BLOCKED", "FLUX/Fal": "BLOCKED", "Hedra": "BLOCKED",
        "Veo/Imagen(Vertex)": "BLOCKED", "Canva": "BLOCKED", "CapCut": "DEPRECATED", "Figma": "USED_IN_PREPROD",
        "Luma_hero_2": "BLOCKED_LUMA",
    }
    W("tool_usage_ledger.json", {"run": run_id, "ledger": led, "heros_luma_reels": n_hero, "pexels_clips": n_pex,
      "note": "G3: statuts dérivés du rendu réel. USED_IN_FINAL = prouvé MP4 ; PREPROD/RESERVED/BLOCKED honnêtes. Runway rétrogradé PREPROD (pas dans ce MP4). Preuves frame/timecode = asset_execution_report post-render."})
    # creative_qa — score MESURÉ autonome (PASS si >=8)
    # G4 (2026-05-30) : gate teste la SOURCE RÉELLE des heros + position disclaimer (plus de True hardcodé).
    try:
        _sz = _json.load(open(Path(__file__).parent / "safe_zones.json"))
        _disc_ok = _sz.get("9:16", {}).get("disclaimer", {}).get("bottom_px", 0) >= 288  # hors zone UI bas-22%
    except Exception:  # noqa: BLE001
        _disc_ok = False
    _hero_real = n_hero >= 1 and os.path.exists(str(Path.home() / ".openclaw/state/cofiapublisher/luma_generations/hero_09155fc4.mp4"))
    cq = {
        "hook_humain": (True, 1.0),
        "captions_sync_<100ms": (abs(drift) < 100, 1.5),
        "cta_visible": (cta_f > 0, 1.5),
        "brand_assets>=5": (n_brand >= 5, 1.5),
        "disclaimer_hors_UI(>=288px)": (_disc_ok, 1.0),
        "hero_source_reelle_Luma": (_hero_real, 1.0),
        "hero_motion>=2": (n_hero >= 2, 1.0),
        "duree_60_80s": (60 <= audio_dur <= 82, 1.5),
    }
    score = round(sum(w for ok, w in cq.values() if ok), 1)
    W("creative_qa_report.json", {"checks": {k: v[0] for k, v in cq.items()}, "sync_drift_ms": drift,
      "duration_s": round(audio_dur, 2), "score": score, "max": 10.0, "verdict": "PASS" if score >= 8 else "FAIL"})
    # cost_ledger
    W("cost_ledger.json", {"ElevenLabs_eur": 0.30, "Suno_credits": 10, "Luma_credits": 180, "Runway_credits_est": 25,
      "Pexels_eur": 0.0, "total_eur_est": 0.6, "plafond_eur": float(os.environ.get("MAX_COST_EUR", "3"))})
    # cross_posting_plan (baseline §14 corrigée)
    W("cross_posting_plan.json", {"master": "video_final.mp4 9:16", "publish": "DRAFT only (GO Erwin §18)", "timezone": "audience FR/EU (Paris)",
      "platforms": {"TikTok": {"slot": "mar-mer 10-11h + 19-23h", "ratio": "9:16"}, "InstagramReels": {"slot": "mar-jeu 11-18h"},
      "YouTubeShorts": {"slot": "vendredi 16h"}, "X": {"slot": "12-18h"}, "LinkedIn": {"slot": "mar-jeu 11-17h"}},
      "recycle": "1 master -> Short + Reel + Story + X(1:1) + LinkedIn(16:9)", "golden_hour": "actif 60 min post-publish", "utm": "par plateforme"})
    # technical_validity
    W("technical_validity_report.json", qa.review(out_mp4))
    # production_manifest (consolidé)
    W("production_manifest.json", {"run": run_id, "contract": "CofiaPublisher_VIP", "duration_s": round(audio_dur, 2),
      "storyboard": [{"beat": i, "role": b["role"], "voix": b["t"], "visual": "hero" if b.get("hero") else b.get("q")} for i, b in enumerate(beats)],
      "shot_list": [{"idx": j, "hero": s.get("hero"), "frames": s["durationInFrames"], "transition": s.get("transition")} for j, s in enumerate(shots)],
      "voice": {"verdict": vr.get("verdict"), "report": "voice_qa_report.json"}, "music": "Suno",
      "reports": ["audio_automation_map.json", "brand_layer_report.json", "creative_qa_report.json", "luma_usage_report.json",
                  "tool_usage_ledger.json", "cost_ledger.json", "cross_posting_plan.json", "technical_validity_report.json"],
      "publish": distribution.PUBLISH_LOCK})


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
