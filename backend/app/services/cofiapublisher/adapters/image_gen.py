"""CofiaPublisher — adapter IMAGE (thumbnails, visuels, plans fixes) multi-provider.

source_tag: NY_COFIAPUB_IMAGE_GEN_20260529
Tiers : Économie = stock (Pexels/Pixabay/Unsplash, cf video_stock) · Medium = FLUX via Fal /
Ideogram (thumbnails) · Premium = Imagen 3 (Google Vertex/Gemini).
Clés testées : IDEOGRAM_API_KEY✅, FAL_KEY✅ (FLUX), GOOGLE/GEMINI✅ (Imagen). Outils créatifs (§15 ok).
Génération réelle = P3 ; ici connectivité auth par provider.
"""
from __future__ import annotations

import os

import httpx

IDEOGRAM_KEY = os.environ.get("IDEOGRAM_API_KEY", "").strip()
FAL_KEY = (os.environ.get("FAL_KEY") or os.environ.get("FAL_API_KEY") or "").strip()
GOOGLE_KEY = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()


def providers() -> dict:
    return {"ideogram": bool(IDEOGRAM_KEY), "flux_fal": bool(FAL_KEY), "imagen_google": bool(GOOGLE_KEY)}


def connectivity() -> dict:
    """Auth-check par provider (sans générer d'image)."""
    out: dict = {}
    # Ideogram (clé présente = prêt ; pas de GET cheap fiable, on rapporte la présence)
    out["ideogram"] = {"key": bool(IDEOGRAM_KEY)}
    # FLUX via Fal (status d'un id inexistant : 404=auth OK)
    if FAL_KEY:
        try:
            r = httpx.get("https://queue.fal.run/fal-ai/flux/dev/requests/probe/status",
                          headers={"Authorization": f"Key {FAL_KEY}"}, timeout=15)
            out["flux_fal"] = {"status": r.status_code, "auth": "valid" if r.status_code in (200, 400, 404, 405, 422) else "rejected"}
        except Exception as e:  # noqa: BLE001
            out["flux_fal"] = {"error": f"{type(e).__name__}"}
    else:
        out["flux_fal"] = {"key": False}
    # Imagen via Google (models list)
    if GOOGLE_KEY:
        try:
            r = httpx.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={GOOGLE_KEY}", timeout=15)
            out["imagen_google"] = {"status": r.status_code, "auth": "valid" if r.status_code == 200 else "check"}
        except Exception as e:  # noqa: BLE001
            out["imagen_google"] = {"error": f"{type(e).__name__}"}
    else:
        out["imagen_google"] = {"key": False}
    return {"ok": True, "providers": out}
