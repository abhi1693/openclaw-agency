"""CofiaPublisher — adapter VISUEL stock (tier ÉCONOMIE, 0€).

source_tag: NY_COFIAPUB_VIDEO_STOCK_20260529
Sources gratuites : Pexels (vidéo+photo) · Pixabay (vidéo+photo) · Unsplash (photo).
Clés (content-apis.env) testées vivantes : PEXELS_API_KEY✅, PIXABAY_API_KEY✅, UNSPLASH_API_KEY✅.
Aligné gate Veo3-économie : écrans/charts statiques -> stock plutôt que vidéo IA payante.
"""
from __future__ import annotations

import os

import httpx

PEXELS_KEY = os.environ.get("PEXELS_API_KEY", "").strip()
PIXABAY_KEY = os.environ.get("PIXABAY_API_KEY", "").strip()
UNSPLASH_KEY = os.environ.get("UNSPLASH_API_KEY", "").strip()


def search_pexels_video(query: str, per_page: int = 5, orientation: str = "portrait") -> dict:
    """Cherche des vidéos Pexels. Retourne {ok, videos:[{id,duration,file_url,width,height}]}."""
    if not PEXELS_KEY:
        return {"ok": False, "error": "PEXELS_API_KEY_missing"}
    try:
        r = httpx.get(
            "https://api.pexels.com/videos/search",
            headers={"Authorization": PEXELS_KEY},
            params={"query": query, "per_page": per_page, "orientation": orientation},
            timeout=20,
        )
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}
    if r.status_code != 200:
        return {"ok": False, "status": r.status_code, "error": r.text[:160]}
    out = []
    for v in r.json().get("videos", []):
        files = sorted(v.get("video_files", []), key=lambda f: (f.get("height") or 0), reverse=True)
        hd = next((f for f in files if (f.get("height") or 0) <= 1920), files[0] if files else None)
        if hd:
            out.append({"id": v.get("id"), "duration": v.get("duration"),
                        "file_url": hd.get("link"), "width": hd.get("width"), "height": hd.get("height")})
    return {"ok": True, "count": len(out), "videos": out}


def pick_best(videos: list, min_dur: int = 3, max_dur: int = 25) -> dict | None:
    """Choisit le meilleur clip : durée exploitable + résolution suffisante (≥1280 de haut)."""
    cands = [v for v in (videos or [])
             if min_dur <= (v.get("duration") or 0) <= max_dur and (v.get("height") or 0) >= 1280]
    return cands[0] if cands else ((videos or [None])[0])


def download(url: str, out_path: str) -> dict:
    """Télécharge un asset (vidéo/photo) vers out_path."""
    try:
        with httpx.stream("GET", url, timeout=60, follow_redirects=True) as r:
            if r.status_code != 200:
                return {"ok": False, "status": r.status_code}
            n = 0
            with open(out_path, "wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
                    n += len(chunk)
        return {"ok": True, "path": out_path, "bytes": n}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}:{str(e)[:160]}"}
