#!/usr/bin/env python3
"""Runway adapter (permanent) — hero IA réel via API officielle api.dev.runwayml.com/v1.
Auth = RUNWAY_API_KEY (content-apis.env). 2 flux :
  - text_to_image (gen4_image) → cover/thumbnail PNG 9:16
  - image_to_video (gen4_turbo) → hero motion MP4 (seed = image générée)
Retourne generation_id (task id) + path pour PREUVE (anti-faux-vert : pas de Pexels déguisé).
Aucun billing au-delà des crédits du plan. Usage:
  python3 -m app.services.cofiapublisher.adapters.video_runway hero "<prompt>" /out/hero.mp4
  python3 -m app.services.cofiapublisher.adapters.video_runway cover "<prompt>" /out/cover.png
"""
from __future__ import annotations
import base64, json, os, sys, time
import httpx

API = "https://api.dev.runwayml.com/v1"
VER = "2024-11-06"


def _key() -> str:
    for f in (os.path.expanduser("~/.openclaw/credentials/content-apis.env"),):
        try:
            for line in open(f):
                if line.startswith("RUNWAY_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"')
        except OSError:
            pass
    return os.environ.get("RUNWAY_API_KEY", "")


def _H():
    return {"Authorization": f"Bearer {_key()}", "X-Runway-Version": VER, "Content-Type": "application/json"}


def _poll(task_id: str, timeout_s: int = 240) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        time.sleep(6)
        r = httpx.get(f"{API}/tasks/{task_id}", headers=_H(), timeout=30)
        if r.status_code != 200:
            return {"ok": False, "reason": f"poll_{r.status_code}", "body": r.text[:200]}
        d = r.json()
        st = d.get("status")
        if st == "SUCCEEDED":
            return {"ok": True, "output": d.get("output", []), "id": task_id}
        if st in ("FAILED", "CANCELLED"):
            return {"ok": False, "reason": st, "detail": d.get("failure", d.get("failureCode", ""))}
    return {"ok": False, "reason": "timeout", "id": task_id}


def text_to_image(prompt: str, out_png: str, ratio: str = "720:1280") -> dict:
    body = {"model": "gen4_image", "promptText": prompt, "ratio": ratio}
    r = httpx.post(f"{API}/text_to_image", headers=_H(), json=body, timeout=60)
    if r.status_code not in (200, 201):
        return {"ok": False, "reason": f"create_{r.status_code}", "body": r.text[:300]}
    tid = r.json().get("id")
    res = _poll(tid)
    if not res.get("ok"):
        return res
    url = (res["output"] or [None])[0]
    if not url:
        return {"ok": False, "reason": "no_output_url", "id": tid}
    img = httpx.get(url, timeout=90, follow_redirects=True)
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    open(out_png, "wb").write(img.content)
    return {"ok": True, "generation_id": tid, "model": "gen4_image", "output_path": out_png, "bytes": len(img.content), "src_url": url}


def image_to_video(prompt: str, seed_png: str, out_mp4: str, ratio: str = "720:1280", duration: int = 5, model: str = "gen4_turbo") -> dict:
    with open(seed_png, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    data_uri = f"data:image/png;base64,{b64}"
    body = {"model": model, "promptImage": data_uri, "promptText": prompt, "ratio": ratio, "duration": duration}
    r = httpx.post(f"{API}/image_to_video", headers=_H(), json=body, timeout=90)
    if r.status_code not in (200, 201):
        return {"ok": False, "reason": f"create_{r.status_code}", "body": r.text[:300]}
    tid = r.json().get("id")
    res = _poll(tid, timeout_s=300)
    if not res.get("ok"):
        return res
    url = (res["output"] or [None])[0]
    if not url:
        return {"ok": False, "reason": "no_output_url", "id": tid}
    vid = httpx.get(url, timeout=180, follow_redirects=True)
    os.makedirs(os.path.dirname(out_mp4), exist_ok=True)
    open(out_mp4, "wb").write(vid.content)
    return {"ok": True, "generation_id": tid, "model": model, "output_path": out_mp4, "bytes": len(vid.content), "src_url": url}


def hero(prompt: str, out_mp4: str) -> dict:
    """text→image (seed) puis image→video → hero MP4 réel avec generation_id."""
    seed = out_mp4.replace(".mp4", "_seed.png")
    si = text_to_image(prompt, seed)
    if not si.get("ok"):
        return {"ok": False, "stage": "seed", **si}
    iv = image_to_video(prompt + ", cinematic slow push-in, premium motion", seed, out_mp4)
    iv["seed_generation_id"] = si.get("generation_id")
    return iv


if __name__ == "__main__":
    mode, prompt, out = sys.argv[1], sys.argv[2], sys.argv[3]
    if mode == "hero":
        print(json.dumps(hero(prompt, out)))
    elif mode == "cover":
        print(json.dumps(text_to_image(prompt, out, ratio="720:1280")))
    else:
        print(json.dumps({"ok": False, "reason": "mode inconnu"}))
