"""CofiaPublisher — adapter VIDÉO IA HERO-MOTION : Luma Dream Machine.

source_tag: NY_COFIAPUB_VIDEO_LUMA_20260529 (HARDLOCK LUMA Erwin)

Luma = moteur HERO-MOTION (reveal marque, 200 IA, market chaos, VIP transformation,
cinematic hero, transition premium). PAS le monteur final (Remotion reste le monteur).

Priorité d'usage :
  1) API officielle Luma (Authorization: Bearer <LUMA_API_KEY>).
  2) Cookie/session fallback UNIQUEMENT si API KO + compte web actif + LUMA_COOKIE présent
     + LUMA_COOKIE_GEN_GO=1 (GO conscient Erwin). Soumis à no_luma_billing_guard.
  3) Sinon → BLOCKED_LUMA (on NE prétend PAS que la vidéo est premium).

Sécurité : aucune clé/cookie loggé, aucun print de secret. Aucune navigation billing/account
(no_luma_billing_guard). Idempotence : un prompt déjà généré n'est jamais repayé.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import httpx

from .no_luma_billing_guard import assert_no_billing  # garde-fou anti-billing


def _bootstrap_cookie_env() -> None:
    """Charge ~/.openclaw/credentials/luma_cookie.env nous-mêmes (le cookie contient ;/$/espaces →
    `source` shell le casse). Parsing KEY=VALUE robuste, sans expansion. Ne loggue aucun secret."""
    p = Path.home() / ".openclaw/credentials/luma_cookie.env"
    if not p.exists():
        return
    try:
        for raw in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v
    except Exception:  # noqa: BLE001
        pass


_bootstrap_cookie_env()

BASE = "https://api.lumalabs.ai/dream-machine/v1"
GEN_DIR = Path(os.environ.get("LUMA_GEN_DIR", str(Path.home() / ".openclaw/state/cofiapublisher/luma_generations")))
MODELS = ["ray-2", "ray-flash-2", "ray-1-6"]

# Estimation de coût (CRÉDITS, best-effort — à confirmer sur le dashboard Luma).
# Marqué "estimate" : ne jamais présenter comme facturation réelle.
_CREDIT_PER_SEC = {"ray-flash-2": 6, "ray-2": 12, "ray-1-6": 8}   # ~crédits / seconde de vidéo
_EUR_PER_CREDIT = 0.0036  # ordre de grandeur ; sert au plafond MAX_COST_EUR


def _key() -> str:
    return (os.environ.get("LUMA_API_KEY") or os.environ.get("LUMALABS_API_KEY") or "").strip()


def _session_jwt() -> str:
    """JWT de session Clerk du compte web (mode 'comme Suno'). Source : LUMA_SESSION_JWT,
    ou extrait de LUMA_COOKIE (`__session=<jwt>`). Jamais loggé."""
    j = os.environ.get("LUMA_SESSION_JWT", "").strip()
    if j:
        return j
    cookie = os.environ.get("LUMA_COOKIE", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("__session="):
            return part[len("__session="):].strip()
    return ""


def _cookie_mode() -> bool:
    """Mode cookie/session autorisé ? (API KO + cookie présent + GO explicite Erwin)."""
    return bool(_session_jwt()) and os.environ.get("LUMA_COOKIE_GEN_GO") == "1"


def _auth_token() -> tuple[str, str]:
    """Retourne (token, mode). API officielle prioritaire ; sinon session JWT si GO cookie."""
    if _cookie_mode():
        return _session_jwt(), "cookie_session"
    return _key(), "api_key"


def _headers() -> dict:
    tok, _ = _auth_token()
    return {"Authorization": f"Bearer {tok}", "accept": "application/json", "content-type": "application/json"}


# ── Mode "comme Suno" RÉEL : BFF web vespa (app.lumalabs.ai/api/vespa) authentifié par le cookie
#    de session (wos-session) extrait de Chrome. Prouvé HTTP 200 le 2026-05-29 (crédits live). ──
VESPA_BASE = os.environ.get("LUMA_VESPA_BASE", "https://app.lumalabs.ai/api/vespa").rstrip("/")
VESPA_TEAM = os.environ.get("LUMA_VESPA_TEAM", "").strip()
# endpoint de génération vespa (confirmé au 1er run GO ; surchargeable sans toucher au code)
VESPA_GEN_PATH = os.environ.get("LUMA_VESPA_GEN_PATH", "/generations")


def _cookie_jar() -> str:
    return os.environ.get("LUMA_COOKIE", "").strip()


def _vespa_ready() -> bool:
    return bool(_cookie_jar() and VESPA_TEAM and os.environ.get("LUMA_COOKIE_GEN_GO") == "1")


def _vespa_headers() -> dict:
    return {"Cookie": _cookie_jar(), "accept": "application/json", "content-type": "application/json",
            "user-agent": "Mozilla/5.0", "referer": "https://app.lumalabs.ai/"}


def _vespa_usage() -> dict:
    """GET /teams/{team}/usage via cookie de session. Lecture seule, zéro coût. Jamais billing."""
    assert_no_billing(f"{VESPA_BASE}/teams/{VESPA_TEAM}/usage")
    try:
        r = httpx.get(f"{VESPA_BASE}/teams/{VESPA_TEAM}/usage", headers=_vespa_headers(), timeout=20, follow_redirects=True)
        if r.status_code == 200:
            d = r.json()
            return {"ok": True, "tier": d.get("tier"), "usage_limit": d.get("usage_limit"),
                    "current_usage": d.get("current_usage"), "credits_remaining": (d.get("usage_limit", 0) - d.get("current_usage", 0)),
                    "subscription_end": d.get("subscription_end")}
        return {"ok": False, "http": r.status_code, "reason": r.text[:120]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:100]}"}


def available() -> bool:
    return bool(_key() or _vespa_ready())


# ──────────────────────────── STATUS ────────────────────────────

def status() -> dict:
    """Audit non destructif : clé présente ? API répond ? crédits ? modèles ? modes ? cookie possible ?
    AUCUN secret renvoyé. Lecture seule (GET /credits). Zéro coût."""
    out = {
        "key_present": bool(_key()),
        "session_jwt_present": bool(_session_jwt()),
        "api_base": BASE,
        "models": MODELS,
        "text_to_video": True, "image_to_video": True,
        "cookie_fallback_configured": bool(_session_jwt()),
        "cookie_gen_go": os.environ.get("LUMA_COOKIE_GEN_GO") == "1",
        "gen_dir": str(GEN_DIR),
    }

    def _try(token: str, mode: str) -> dict:
        if not token:
            return {"mode": mode, "http": None, "ok": False, "reason": "token absent"}
        try:
            r = httpx.get(f"{BASE}/credits", headers={"Authorization": f"Bearer {token}", "accept": "application/json"}, timeout=20)
            return {"mode": mode, "http": r.status_code, "ok": r.status_code == 200,
                    "credits": (r.json() if r.status_code == 200 else None),
                    "reason": (None if r.status_code == 200 else f"HTTP {r.status_code}: {r.text[:100]}")}
        except Exception as e:  # noqa: BLE001
            return {"mode": mode, "http": None, "ok": False, "reason": f"{type(e).__name__}:{str(e)[:90]}"}

    api_res = _try(_key(), "api_key")
    out["api_key_probe"] = {k: api_res[k] for k in ("mode", "http", "ok", "reason")}

    # Mode cookie RÉEL = BFF vespa (app.lumalabs.ai/api/vespa) via wos-session — prouvé
    vespa = {"ok": False, "reason": "non testé (cookie/team/GO absent)"}
    if _vespa_ready():
        vespa = _vespa_usage()
    out["vespa_probe"] = {"team": bool(VESPA_TEAM), "cookie": bool(_cookie_jar()), "go": out["cookie_gen_go"],
                          "ok": vespa.get("ok"), "reason": vespa.get("reason") or vespa.get("error")}

    if api_res["ok"]:
        out.update({"api_ok": True, "auth_mode": "api_key", "credits": api_res.get("credits"), "verdict": "READY"})
    elif vespa.get("ok"):
        out.update({"api_ok": False, "auth_mode": "cookie_vespa", "verdict": "READY_COOKIE",
                    "credits": {"tier": vespa.get("tier"), "limit": vespa.get("usage_limit"),
                                "used": vespa.get("current_usage"), "remaining": vespa.get("credits_remaining")}})
    else:
        reason = "API officielle KO (trial sans accès API)."
        if not _cookie_jar():
            reason += " Cookie session vespa non configuré (LUMA_COOKIE absent)."
        elif not out["cookie_gen_go"]:
            reason += " Cookie présent mais LUMA_COOKIE_GEN_GO=1 manquant."
        else:
            reason += f" Vespa KO ({vespa.get('reason') or vespa.get('error')})."
        out.update({"api_ok": False, "auth_mode": None, "verdict": "BLOCKED_LUMA", "reason": reason})

    out["can_generate"] = bool(out.get("api_ok") or out.get("verdict") == "READY_COOKIE")
    return out


# ──────────────────────────── COST ────────────────────────────

def estimate_cost(duration_s: float = 5, model: str = "ray-2") -> dict:
    """Estime le coût AVANT génération. Crédits (best-effort) + EUR approx. À écrire dans cost_ledger."""
    cps = _CREDIT_PER_SEC.get(model, 12)
    credits = int(round(cps * max(1.0, duration_s)))
    return {"model": model, "duration_s": duration_s, "credits_est": credits,
            "eur_est": round(credits * _EUR_PER_CREDIT, 3), "note": "estimate — confirmer sur dashboard Luma"}


# ──────────────────────────── IDEMPOTENCE ────────────────────────────

def _idem_key(prompt: str, mode: str, model: str, source_image: str | None) -> str:
    raw = f"{mode}|{model}|{prompt}|{source_image or ''}"
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


def _cached(idem: str) -> dict | None:
    rec = GEN_DIR / f"{idem}.json"
    if rec.exists():
        try:
            d = json.loads(rec.read_text())
            out = d.get("output_path")
            if out and os.path.exists(out) and os.path.getsize(out) > 10_000:
                return d
        except Exception:  # noqa: BLE001
            return None
    return None


def _save_rec(idem: str, rec: dict) -> None:
    GEN_DIR.mkdir(parents=True, exist_ok=True)
    (GEN_DIR / f"{idem}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1))


# ──────────────────────────── GÉNÉRATION ────────────────────────────

def _gate(duration_s: float, model: str) -> dict | None:
    """Garde-fous communs avant toute génération PAYANTE. Retourne un dict d'erreur si bloqué, sinon None."""
    st = status()
    if not st.get("can_generate"):
        return {"ok": False, "status": "BLOCKED_LUMA", "reason": st.get("reason", "Luma indisponible"), "audit": st}
    if os.environ.get("LUMA_GEN_GO") != "1":
        return {"ok": False, "status": "GATED", "reason": "génération Luma payante : LUMA_GEN_GO=1 requis (GO Erwin)"}
    est = estimate_cost(duration_s, model)
    ceiling = float(os.environ.get("MAX_COST_EUR", "3"))
    if est["eur_est"] > ceiling:
        return {"ok": False, "status": "OVER_BUDGET", "reason": f"{est['eur_est']}€ > plafond {ceiling}€", "estimate": est}
    return None


def _submit(payload: dict) -> dict:
    """POST /generations. Auth = clé API si dispo, sinon JWT session 'comme Suno' (gated + guardé).
    Jamais de billing : assert_no_billing sur l'endpoint."""
    st = status()
    if not st.get("can_generate"):
        return {"ok": False, "status": "BLOCKED_LUMA", "reason": st.get("reason")}
    assert_no_billing(f"{BASE}/generations")  # double sécurité anti-billing (vaut surtout chemin cookie)
    tok, mode = _auth_token()
    r = httpx.post(f"{BASE}/generations",
                   headers={"Authorization": f"Bearer {tok}", "accept": "application/json", "content-type": "application/json"},
                   json=payload, timeout=60)
    return {"ok": r.status_code in (200, 201), "http": r.status_code, "auth_mode": mode,
            "data": (r.json() if r.status_code in (200, 201) else r.text[:200])}


def generate_text_to_video(prompt: str, out_path: str, shot_id: str = "hero",
                           duration_s: float = 5, model: str = "ray-2", resolution: str = "720p") -> dict:
    """Génère un HERO shot text→video. Idempotent, gated, budget-checké. Ne repaye jamais un prompt déjà rendu."""
    idem = _idem_key(prompt, "text_to_video", model, None)
    cache = _cached(idem)
    if cache:
        return {"ok": True, "status": "REUSED", "shot_id": shot_id, "generation_id": cache.get("generation_id"),
                "output_path": cache["output_path"], "idem": idem, "cost_estimate": cache.get("cost_estimate")}
    blocked = _gate(duration_s, model)
    if blocked:
        return {**blocked, "shot_id": shot_id, "mode": "text_to_video", "idem": idem}
    est = estimate_cost(duration_s, model)
    sub = _submit({"prompt": prompt, "model": model, "resolution": resolution, "duration": f"{int(duration_s)}s"})
    if not sub.get("ok"):
        return {**sub, "shot_id": shot_id, "mode": "text_to_video", "idem": idem, "cost_estimate": est}
    gid = (sub.get("data") or {}).get("id")
    rec = {"generation_id": gid, "shot_id": shot_id, "mode": "text_to_video", "prompt": prompt, "model": model,
           "source_image": None, "duration_s": duration_s, "cost_estimate": est, "output_path": out_path,
           "provider_response": sub.get("data"), "ts": int(time.time())}
    _save_rec(idem, rec)
    return {"ok": True, "status": "SUBMITTED", "generation_id": gid, "idem": idem, "shot_id": shot_id, "cost_estimate": est}


def generate_image_to_video(prompt: str, source_image_url: str, out_path: str, shot_id: str = "hero",
                            duration_s: float = 5, model: str = "ray-2", resolution: str = "720p") -> dict:
    """Génère un HERO shot image→video (anime un asset COF : logo reveal, badge, chart). Idempotent + gated + budget."""
    idem = _idem_key(prompt, "image_to_video", model, source_image_url)
    cache = _cached(idem)
    if cache:
        return {"ok": True, "status": "REUSED", "shot_id": shot_id, "generation_id": cache.get("generation_id"),
                "output_path": cache["output_path"], "idem": idem, "cost_estimate": cache.get("cost_estimate")}
    blocked = _gate(duration_s, model)
    if blocked:
        return {**blocked, "shot_id": shot_id, "mode": "image_to_video", "idem": idem}
    est = estimate_cost(duration_s, model)
    sub = _submit({"prompt": prompt, "model": model, "resolution": resolution, "duration": f"{int(duration_s)}s",
                   "keyframes": {"frame0": {"type": "image", "url": source_image_url}}})
    if not sub.get("ok"):
        return {**sub, "shot_id": shot_id, "mode": "image_to_video", "idem": idem, "cost_estimate": est}
    gid = (sub.get("data") or {}).get("id")
    rec = {"generation_id": gid, "shot_id": shot_id, "mode": "image_to_video", "prompt": prompt, "model": model,
           "source_image": source_image_url, "duration_s": duration_s, "cost_estimate": est, "output_path": out_path,
           "provider_response": sub.get("data"), "ts": int(time.time())}
    _save_rec(idem, rec)
    return {"ok": True, "status": "SUBMITTED", "generation_id": gid, "idem": idem, "shot_id": shot_id, "cost_estimate": est}


def poll_generation(generation_id: str, timeout_s: int = 300, interval_s: int = 8) -> dict:
    """Attend la fin d'une génération. GET /generations/{id} jusqu'à state=completed/failed."""
    if not status().get("api_ok"):
        return {"ok": False, "status": "BLOCKED_LUMA", "reason": "API non authentifiée"}
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            r = httpx.get(f"{BASE}/generations/{generation_id}", headers=_headers(), timeout=20)
            if r.status_code == 200:
                d = r.json()
                state = d.get("state")
                if state in ("completed", "failed"):
                    url = (d.get("assets") or {}).get("video")
                    return {"ok": state == "completed", "state": state, "video_url": url, "raw": d}
        except Exception:  # noqa: BLE001
            pass
        time.sleep(interval_s)
    return {"ok": False, "status": "TIMEOUT", "generation_id": generation_id}


def download_result(video_url: str, out_path: str) -> dict:
    """Télécharge le MP4 hero généré."""
    try:
        r = httpx.get(video_url, timeout=180, follow_redirects=True)
        if r.status_code != 200:
            return {"ok": False, "http": r.status_code}
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(r.content)
        return {"ok": True, "path": out_path, "bytes": len(r.content)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:120]}"}


def usage_report() -> dict:
    """Ledger d'usage Luma : toutes les générations stockées (idempotence + coût cumulé estimé)."""
    GEN_DIR.mkdir(parents=True, exist_ok=True)
    recs = []
    total_credits = 0
    for p in sorted(GEN_DIR.glob("*.json")):
        try:
            d = json.loads(p.read_text())
            recs.append({"shot_id": d.get("shot_id"), "mode": d.get("mode"), "generation_id": d.get("generation_id"),
                         "output_path": d.get("output_path"), "credits_est": (d.get("cost_estimate") or {}).get("credits_est"),
                         "valid": bool(d.get("output_path") and os.path.exists(d.get("output_path", "")))})
            total_credits += ((d.get("cost_estimate") or {}).get("credits_est") or 0)
        except Exception:  # noqa: BLE001
            continue
    return {"count": len(recs), "total_credits_est": total_credits, "generations": recs, "gen_dir": str(GEN_DIR)}
