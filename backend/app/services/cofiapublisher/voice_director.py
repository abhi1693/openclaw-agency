"""CofiaPublisher — VOICE DIRECTOR (gate voix obligatoire).

source_tag: NY_COFIAPUB_VOICE_DIRECTOR_20260529 (Erwin contrat voix)

Rôle : AUCUN script écrit ne part en brut vers ElevenLabs. Tout passe par direct() qui :
  1. ORALISE le script (écrit → oral français) + remplace les mots mal lus
     ("taper" → "prendre un trade"…) via un dictionnaire éditable.
  2. Applique un DICTIONNAIRE DE PRONONCIATION COF (CofiaTrading, VIP, IA, COF, Erwin, signaux, trading…)
     — formes phonétiques pour l'audio, restaurées proprement dans les captions.
  3. FORCE les params ElevenLabs : language_code="fr", apply_text_normalization="on",
     optimize_streaming_latency=0, style=0, voix FR validée, endpoint /with-timestamps.
  4. Génère jusqu'à 3 PRISES (seeds différents), les AUDITE (round-trip Whisper FR + checks structurels),
     rejette toute voix robotique / mal prononcée.
  5. Écrit voice_qa_report.json. **Aucune vidéo ne passe le gate si verdict != PASS.**

Dico éditable : ~/.openclaw/config/cofiapublisher_voice_dico.json (créé au 1er run avec les défauts).
Audit STT : faster_whisper via /opt/homebrew/bin/python3 (hors venv backend).
"""
from __future__ import annotations

import difflib
import json
import os
import re
import subprocess
from pathlib import Path

from .adapters import voice_elevenlabs as ve

# ── Voix FR VALIDÉES sur le compte Erwin (vérifié 2026-05-29 via /v1/voices) ──
VALIDATED_FR_VOICES = {
    "raphael": "OKpKhTrwN6S16IfQTHzZ",   # pub / shorts / social media — idéal short-form
    "louis": "jGGIwkfv43kUFffPXEEO",      # narrateur documentaire FR
    "leo": "AfbuxQ9DVtS4azaxN1W7",        # rassurant et dynamique
    "laurent": "bjgrAyksP9wfGoNKamR1",    # corporate deep confident
    "marc_aurele": "RTFg9niKcgGLDwa3RFlz",
    "burak": "xNqw2X507pSLkWChJRsW",      # voix clonée d'Erwin
}
# Voix FR par défaut (override : COF_VOICE_FR_ID). Raphael = profil short-form social.
DEFAULT_FR_VOICE = os.environ.get("COF_VOICE_FR_ID", VALIDATED_FR_VOICES["raphael"]).strip()
# Modèle FR validé (multilingual_v2 = prononciation FR propre, accepte language_code+normalisation+style).
VOICE_MODEL = os.environ.get("COF_VOICE_MODEL", "eleven_multilingual_v2").strip()

# ── Casting multi-voix piloté par roster (étend VALIDATED_FR_VOICES) ──
# Source de vérité : ~/.openclaw/config/cofiapublisher_voice_roster.json (voix FR fine-tunées +
# mapping rôle→voix + voix cassées). Vérifié live 2026-05-31 via /v1/voices.
VOICE_ROSTER_PATH = Path(os.environ.get("COF_VOICE_ROSTER",
                         str(Path.home() / ".openclaw/config/cofiapublisher_voice_roster.json")))
VOICE_ROLES: dict = {}        # rôle sémantique (hook/narrator/hype/cta…) -> voice_id
DEAD_VOICES: set = set()      # voice_ids inutilisables (ex: clone burak jamais fine-tuné)
DEAD_NAMES: set = set()       # noms/clés de voix cassées (ex: "burak") -> fallback
FALLBACK_VOICE = DEFAULT_FR_VOICE

def _load_roster() -> None:
    """Charge le roster JSON → enrichit VALIDATED_FR_VOICES / VOICE_ROLES / DEAD_VOICES.
    Sans effet si le fichier manque (on garde les défauts hardcodés)."""
    global FALLBACK_VOICE
    try:
        data = json.loads(VOICE_ROSTER_PATH.read_text(encoding="utf-8"))
    except Exception:
        return
    for key, meta in (data.get("voices") or {}).items():
        vid = (meta or {}).get("id")
        if vid:
            VALIDATED_FR_VOICES[key] = vid
    for role, key in (data.get("roles") or {}).items():
        vid = VALIDATED_FR_VOICES.get(key)
        if vid:
            VOICE_ROLES[role] = vid
    for key, meta in (data.get("broken") or {}).items():
        vid = (meta or {}).get("id")
        if vid:
            DEAD_VOICES.add(vid)
        DEAD_NAMES.add(key)
        VALIDATED_FR_VOICES.pop(key, None)   # ne jamais exposer une voix cassée
    fb = data.get("fallback_voice")
    if fb and VALIDATED_FR_VOICES.get(fb):
        FALLBACK_VOICE = VALIDATED_FR_VOICES[fb]

_load_roster()

def pick_voice(role_or_voice=None) -> str:
    """Résout un rôle (hook/narrator/hype/cta…) OU un nom de voix (raphael/louis…) OU un voice_id brut
    → voice_id utilisable. Une voix cassée/None retombe sur le fallback (jamais de voix robot)."""
    if not role_or_voice:
        return FALLBACK_VOICE
    k = str(role_or_voice).strip()
    if k in VOICE_ROLES:
        return VOICE_ROLES[k]
    if k in VALIDATED_FR_VOICES:
        return VALIDATED_FR_VOICES[k]
    if k in DEAD_VOICES or k in DEAD_NAMES:
        return FALLBACK_VOICE
    return k  # déjà un voice_id valide

WHISPER_PY = os.environ.get("COF_WHISPER_PY", "/opt/homebrew/bin/python3")
WHISPER_MODEL = os.environ.get("COF_WHISPER_MODEL", "small")

DICO_PATH = Path(os.environ.get("COF_VOICE_DICO",
                 str(Path.home() / ".openclaw/config/cofiapublisher_voice_dico.json")))

# ── Défauts du dictionnaire (si le fichier JSON n'existe pas encore) ──
# oral_replacements : écrit → oral (mots que ElevenLabs / le style écrit rendent mal à l'oral)
# pronunciation     : terme → forme PHONÉTIQUE envoyée à ElevenLabs (tokens à tirets = 1 mot caption)
# display_restore   : forme phonétique (lower) → forme affichée à l'écran (caption propre)
DEFAULTS = {
    "oral_replacements": {
        r"\btaper\b": "prendre un trade",
        r"\btaper sur le bouton\b": "cliquer sur le bouton",
        r"\bcliquez\b": "clique",
        r"\bvoici le lien\b": "le lien est juste là",
        r"\bH24\b": "vingt-quatre heures sur vingt-quatre",
        r"\b24/7\b": "vingt-quatre heures sur vingt-quatre, sept jours sur sept",
        r"\bvs\b": "contre",
        r"\b&\b": "et",
        r"%": " pour cent",
        r"€": " euros",
        r"\$": " dollars",
    },
    "pronunciation": {
        r"\bCofiaTrading\b": "Cofia Trading",
        r"\bCofiatrading\b": "Cofia Trading",
        r"\bcofiatrading\b": "Cofia Trading",
        r"\bVIP\b": "vé-i-pé",
        r"\bIA\b": "i-a",
        r"\bI\.A\.\b": "i-a",
        r"\bCOF\b": "Kof",
    },
    "display_restore": {
        "vé-i-pé": "VIP",
        "i-a": "IA",
        "kof": "COF",
    },
}


def _load_dico() -> dict:
    """Charge le dico éditable ; crée le fichier avec les défauts au 1er passage."""
    try:
        if DICO_PATH.exists():
            d = json.loads(DICO_PATH.read_text())
            for k, v in DEFAULTS.items():
                d.setdefault(k, v)
            return d
        DICO_PATH.parent.mkdir(parents=True, exist_ok=True)
        DICO_PATH.write_text(json.dumps(DEFAULTS, ensure_ascii=False, indent=2))
    except Exception:  # noqa: BLE001
        pass
    return DEFAULTS


def oralize(script: str) -> str:
    """Écrit → ORAL français : applique les remplacements de mots mal lus + nettoyage léger.
    (La prononciation phonétique est appliquée séparément par to_spoken.)"""
    dico = _load_dico()
    out = script.strip()
    for pat, rep in dico["oral_replacements"].items():
        out = re.sub(pat, rep, out, flags=re.IGNORECASE)
    out = re.sub(r"\s+", " ", out).strip()
    if out and out[-1] not in ".!?…":
        out += "."
    return out


def to_spoken(script: str) -> tuple[str, dict]:
    """Retourne (texte_parlé_pour_ElevenLabs, display_restore). Interdit le texte brut :
    oralise PUIS applique le dico de prononciation phonétique."""
    dico = _load_dico()
    spoken = oralize(script)
    for pat, rep in dico["pronunciation"].items():
        spoken = re.sub(pat, rep, spoken)
    return spoken, dict(dico["display_restore"])


def restore_captions(captions: list[dict], restore: dict) -> list[dict]:
    """Remet les formes d'affichage propres (vé-i-pé → VIP) dans les captions, sans toucher au timing."""
    if not restore:
        return captions
    rl = {k.lower(): v for k, v in restore.items()}

    def fix(tok: str) -> str:
        return rl.get(tok.lower().strip(".,!?;:»«"), tok)

    for ch in captions:
        for t in ch.get("tokens", []):
            t["text"] = fix(t["text"])
        ch["text"] = " ".join(t["text"] for t in ch.get("tokens", [])) or " ".join(
            fix(w) for w in ch.get("text", "").split())
    return captions


# ──────────────────────────── AUDIT (QA) ────────────────────────────

def _norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-zàâäéèêëïîôöùûüç0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


import unicodedata  # noqa: E402

_FR_NUM = {"zero", "un", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
           "onze", "douze", "treize", "quatorze", "quinze", "seize", "vingt", "vingts", "trente",
           "quarante", "cinquante", "soixante", "cent", "cents", "mille", "million", "millions"}
# Déphonétise les formes envoyées à ElevenLabs → forme entendue par Whisper, pour comparer juste.
_REVERT = [("ve i pe", "vip"), ("v i p", "vip"), ("i a", "ia"), ("coffia", "cofia"),
           ("cophia", "cofia"), ("kofia", "cofia"), ("kof", "cof")]


def _deaccent(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _canonical(s: str) -> str:
    """Normalise pour comparaison STT : sans accents, déphonétisé, sans nombres (lus correctement
    de toute façon et formatés différemment par Whisper : 'deux cents'≠'200')."""
    s = _deaccent(_norm(s))
    for a, b in _REVERT:
        s = s.replace(a, b)
    toks = [t for t in s.split() if not t.isdigit() and t not in _FR_NUM]
    return " ".join(toks)


def _whisper_check(audio_path: str) -> dict:
    """Round-trip STT FR (faster_whisper hors venv). Retourne {ok, text, avg_logprob}."""
    code = (
        "import sys,json\n"
        "from faster_whisper import WhisperModel\n"
        f"m=WhisperModel('{WHISPER_MODEL}',device='cpu',compute_type='int8')\n"
        f"segs,_=m.transcribe(r'''{audio_path}''',language='fr',vad_filter=True)\n"
        "segs=list(segs)\n"
        "txt=' '.join(s.text for s in segs).strip()\n"
        "lp=[s.avg_logprob for s in segs if s.avg_logprob is not None]\n"
        "print(json.dumps({'text':txt,'avg_logprob':(sum(lp)/len(lp) if lp else -9.0)}))\n"
    )
    try:
        r = subprocess.run([WHISPER_PY, "-c", code], capture_output=True, text=True, timeout=240)
        line = (r.stdout.strip().splitlines() or [""])[-1]
        d = json.loads(line)
        return {"ok": True, "text": d["text"], "avg_logprob": float(d["avg_logprob"])}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:120]}", "stderr": (r.stderr[:200] if 'r' in dir() else "")}


# Termes de marque à vérifier dans le round-trip Whisper : terme écrit → variantes acceptées entendues.
BRAND_CHECK = {
    r"\bVIP\b": ("VIP", {"vip"}),
    r"\bIA\b": ("IA", {"ia"}),
    r"\bI\.A\.\b": ("IA", {"ia"}),
    r"cofiatrading": ("CofiaTrading", {"cofia", "coffia", "cophia", "kofia"}),
    r"\bCOF\b": ("COF", {"cof", "kof"}),
    r"\bErwin\b": ("Erwin", {"erwin", "erwine", "irwin", "erouine"}),
}


def _brand_terms_in(raw: str) -> list[tuple[str, set]]:
    """Termes de marque présents dans le script écrit (à vérifier ensuite dans l'audio)."""
    out = []
    for pat, (label, variants) in BRAND_CHECK.items():
        if re.search(pat, raw, flags=re.IGNORECASE):
            out.append((label, variants))
    return out


def _elongations(stt_text: str) -> list[str]:
    """Détecte les mots allongés type 'taperrr' : 3+ lettres identiques consécutives (hors cas FR normaux)."""
    bad = []
    for m in re.finditer(r"\b\w*(\w)\1{2,}\w*\b", stt_text.lower()):
        bad.append(m.group(0))
    return bad


def audit_take(audio_path: str, alignment: dict, expected_spoken: str,
               brand_terms: list | None = None) -> dict:
    """Audite une prise : intelligibilité+prononciation (Whisper), débit, robotique (avg_logprob),
    mots allongés ('taperrr'), termes de marque bien lus (VIP/IA/CofiaTrading). Retourne {pass, score, reasons, metrics}."""
    reasons, metrics = [], {}
    brand_terms = brand_terms or []
    ends = alignment.get("ends_s") or [0]
    dur = float(ends[-1]) if ends else 0.0
    n_words = max(1, len(_norm(expected_spoken).split()))
    wps = n_words / dur if dur > 0 else 0
    metrics["duration_s"] = round(dur, 2)
    metrics["wps"] = round(wps, 2)
    if not (1.5 <= wps <= 4.5):
        reasons.append(f"débit_anormal_{wps:.1f}wps")

    w = _whisper_check(audio_path)
    sim = 0.0
    brand_ok = True
    elong = []
    if w.get("ok"):
        sim = difflib.SequenceMatcher(None, _canonical(expected_spoken), _canonical(w["text"])).ratio()
        metrics["stt_similarity"] = round(sim, 3)
        metrics["avg_logprob"] = round(w["avg_logprob"], 3)
        metrics["stt_text"] = w["text"][:240]
        if sim < 0.70:
            reasons.append(f"mal_prononcé_sim_{sim:.2f}")
        if w["avg_logprob"] < -0.85:
            reasons.append(f"voix_robotique_logprob_{w['avg_logprob']:.2f}")
        # mots allongés ('taperrr')
        elong = _elongations(w["text"])
        if elong:
            reasons.append(f"mot_allongé:{','.join(elong[:3])}")
        # termes de marque réellement entendus (sous-chaîne sur texte déaccentué collé)
        collapsed = _deaccent(_norm(w["text"])).replace(" ", "")
        missed = [label for label, variants in brand_terms
                  if not any(_deaccent(v).replace(" ", "") in collapsed for v in variants)]
        if missed:
            brand_ok = False
            reasons.append(f"marque_mal_lue:{','.join(missed)}")
        metrics["brand_checked"] = [b[0] for b in brand_terms]
        metrics["brand_missed"] = missed
    else:
        metrics["stt_error"] = w.get("error")
        reasons.append("stt_indisponible_REJET")  # sans audit acoustique réel → pas de PASS

    structural_ok = 1.5 <= wps <= 4.5 and dur > 0
    acoustic_ok = w.get("ok", False) and sim >= 0.70 and w.get("avg_logprob", -9) >= -0.85
    passed = structural_ok and acoustic_ok and not elong and brand_ok
    score = round((sim * 0.7) + (min(1.0, max(0.0, (metrics.get("avg_logprob", -2) + 1.0))) * 0.3), 3)
    return {"pass": bool(passed), "score": score, "reasons": reasons or ["ok"], "metrics": metrics}


# ──────────────────────────── ENTRÉE PRINCIPALE ────────────────────────────

def direct(script: str, out_path: str, run_dir, voice_id: str | None = None, takes: int = 3) -> dict:
    """GATE VOIX. Oralise + dico, force les params, génère jusqu'à `takes` prises, audite, choisit la
    meilleure PASS. Écrit voice_qa_report.json. Retourne ok=True UNIQUEMENT si verdict==PASS.
    {ok, verdict, path, alignment, display_restore, spoken_text, qa_report, report_path}."""
    rd = Path(run_dir)
    # Accepte un rôle (hook/narrator/…), un nom de voix, ou un voice_id. Jamais le clone mort.
    vid = pick_voice(voice_id) if voice_id else DEFAULT_FR_VOICE
    if vid in DEAD_VOICES:
        vid = FALLBACK_VOICE
    vid = vid.strip()
    spoken, display_restore = to_spoken(script)
    if not spoken or spoken == script.strip():
        # garde-fou "interdit le texte brut" : on exige une transformation effective
        spoken = oralize(script)

    forced = dict(language_code="fr", apply_text_normalization="on",
                  optimize_streaming_latency=0,
                  voice_settings={"stability": 0.5, "similarity_boost": 0.85,
                                  "style": 0.0, "use_speaker_boost": True})
    brand_terms = _brand_terms_in(script)
    takes_log, best = [], None
    for i in range(1, max(1, takes) + 1):
        take_mp3 = str(rd / f"voice_take_{i}.mp3")
        vr = ve.synthesize_with_timestamps(spoken, take_mp3, voice_id=vid, model_id=VOICE_MODEL,
                                            seed=i * 1000, **forced)
        if not vr.get("ok"):
            takes_log.append({"take": i, "ok": False, "error": vr.get("error") or vr.get("status")})
            continue
        qa = audit_take(take_mp3, vr["alignment"], spoken, brand_terms=brand_terms)
        rec = {"take": i, "ok": True, "path": take_mp3, "seed": i * 1000,
               "pass": qa["pass"], "score": qa["score"], "reasons": qa["reasons"], "metrics": qa["metrics"]}
        takes_log.append(rec)
        if best is None or qa["score"] > best["score"] or (qa["pass"] and not best["pass"]):
            best = {**rec, "alignment": vr["alignment"]}
        if qa["pass"]:
            break  # 1ère prise PASS = on s'arrête

    verdict = "PASS" if (best and best.get("pass")) else "FAIL"
    if best and best.get("pass"):
        m = best["metrics"]
        justification = (f"Prise {best['take']} retenue : PASS — similarité STT {m.get('stt_similarity')}, "
                         f"logprob {m.get('avg_logprob')} (non robotique), débit {m.get('wps')} mots/s, "
                         f"0 mot allongé, marque entendue OK ({m.get('brand_checked')}).")
    elif best:
        justification = (f"Aucune prise PASS sur {len(takes_log)}. Meilleure = prise {best['take']} "
                         f"(score {best.get('score')}, raisons {best.get('reasons')}). Vidéo BLOQUÉE.")
    else:
        justification = "Aucune prise générée (échec ElevenLabs). Vidéo BLOQUÉE."
    report = {
        "verdict": verdict, "voice_id": vid, "model": VOICE_MODEL,
        "forced_params": {k: v for k, v in forced.items() if k != "voice_settings"} | {"style": 0.0,
                          "endpoint": "/with-timestamps"},
        "brand_terms_checked": [b[0] for b in brand_terms],
        "spoken_text": spoken, "raw_script": script.strip(),
        "chosen_take": best["take"] if best else None,
        "selected_voice": str(rd / "selected_voice.mp3") if (best and best.get("pass")) else None,
        "justification": justification,
        "takes": takes_log,
    }
    report_path = rd / "voice_qa_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    if verdict != "PASS" or not best:
        return {"ok": False, "verdict": verdict, "error": "VOICE_QA_FAILED",
                "report_path": str(report_path), "qa_report": report, "justification": justification}

    # promeut la prise gagnante : selected_voice.mp3 (livrable) + out_path (pipeline)
    import shutil
    sel = str(rd / "selected_voice.mp3")
    shutil.copyfile(best["path"], sel)
    shutil.copyfile(best["path"], out_path)
    return {"ok": True, "verdict": "PASS", "path": out_path, "selected_voice": sel,
            "alignment": best["alignment"], "display_restore": display_restore, "spoken_text": spoken,
            "report_path": str(report_path), "qa_report": report, "chosen_take": best["take"],
            "justification": justification}


def direct_multi(segments: list, out_path: str, run_dir, takes: int = 2) -> dict:
    """CASTING MULTI-VOIX. Chaque segment = {"voice": role|nom|id, "text": "..."} passe par la GATE
    `direct()` (oralise + params FR forcés + QA Whisper), puis concaténation en un seul MP3 (out_path).
    Permet plusieurs personnages / narration multi-voix dans un même rendu.
    ok=True seulement si TOUS les segments PASS. {ok, path, segments:[...], failed:[...], n_voices}."""
    import shutil, subprocess
    rd = Path(run_dir); rd.mkdir(parents=True, exist_ok=True)
    results, parts, failed = [], [], []
    for i, seg in enumerate(segments, 1):
        sub = rd / f"seg_{i}"; sub.mkdir(parents=True, exist_ok=True)
        seg_out = str(sub / "selected_voice.mp3")
        vid = pick_voice(seg.get("voice") or seg.get("role"))
        r = direct(seg.get("text", ""), seg_out, sub, voice_id=vid, takes=takes)
        results.append({"i": i, "voice_id": vid, "role": seg.get("voice") or seg.get("role"),
                        "verdict": r.get("verdict"), "ok": r.get("ok"), "path": r.get("path")})
        if r.get("ok"):
            parts.append(r["path"])
        else:
            failed.append({"i": i, "voice_id": vid, "error": r.get("error"),
                           "justification": r.get("justification")})
    if failed or not parts:
        return {"ok": False, "error": "MULTIVOICE_SEGMENT_FAILED", "segments": results, "failed": failed}
    ff = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    lst = rd / "concat_list.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts), encoding="utf-8")
    cp = subprocess.run([ff, "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out_path)],
                        capture_output=True, text=True)
    if cp.returncode != 0 or not Path(out_path).exists():
        return {"ok": False, "error": f"FFMPEG_CONCAT_FAILED: {cp.stderr[-200:]}", "segments": results}
    return {"ok": True, "path": str(out_path), "segments": results,
            "n_voices": len({r["voice_id"] for r in results})}
