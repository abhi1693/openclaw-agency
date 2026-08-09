"""CofiaPublisher — couche DISTRIBUTION (étape 8 : publish multi-réseaux).

source_tag: NY_COFIAPUB_DISTRIBUTION_20260529
HARD_LOCK §18 : publish_lock.allowed = False par défaut. Drafts only. AUCUNE publication
sans GO Erwin nominatif. Ce module n'envoie RIEN — il décrit les cibles + vérifie la présence
des tokens (jamais les valeurs), et garde le verrou.
DEPRECATED (ne PAS utiliser) : YouTube Analytics MCP, HeyGen Creator.
"""
from __future__ import annotations

import os
from pathlib import Path

YT_TOKEN_FILE = Path("/Users/burakokyay/cof-trading/config/youtube-token.json")


def _has(*envs: str) -> bool:
    return any((os.environ.get(e) or "").strip() for e in envs)


def platforms() -> list[dict]:
    """Cibles de distribution + statut réel (présence token, jamais la valeur)."""
    return [
        {"id": "youtube", "name": "YouTube channel + Studio", "role": "Publication principale",
         "status": "ACTIVE", "token": "file" if YT_TOKEN_FILE.exists() else "missing",
         "note": "OAuth à revérifier (invalid_grant constaté avant) — refresh requis avant 1er upload"},
        {"id": "youtube_data_api", "name": "YouTube Data API", "role": "Upload automatisé",
         "status": "ACTIVE", "token": "file" if YT_TOKEN_FILE.exists() else "missing", "note": "client-secret présent"},
        {"id": "tiktok", "name": "TikTok + LIVE Studio", "role": "Repost / vertical",
         "status": "SETUP", "token": "present" if _has("TIKTOK_ACCESS_TOKEN") else "placeholder",
         "note": "token dev portal à générer"},
        {"id": "facebook", "name": "Facebook Page + Ads", "role": "Diffusion Meta",
         "status": "ACTIVE", "token": "present" if _has("FB_PAGE_ACCESS_TOKEN", "META_FB_PAGE_ACCESS_TOKEN") else "missing", "note": ""},
        {"id": "instagram", "name": "Instagram Meta Graph", "role": "Reels / posts",
         "status": "ACTIVE" if _has("INSTAGRAM_ACCESS_TOKEN") else "VERIFY",
         "token": "present" if _has("INSTAGRAM_ACCESS_TOKEN") else "missing",
         "note": "IG_BUSINESS_ID présent ; posts récents constatés"},
        {"id": "x_twitter", "name": "X / Twitter Premium Pro", "role": "Repost",
         "status": "VERIFY", "token": "present" if _has("TWITTER_BEARER_TOKEN", "X_API_KEY", "TWITTER_API_KEY") else "not_in_canon_creds",
         "note": "tweets postés avant → creds existent ailleurs, à localiser"},
        {"id": "threads", "name": "Threads", "role": "Canal social",
         "status": "REGISTERED", "token": "app_creds" if _has("META_THREADS_APP_ID") else "missing",
         "note": "app creds présents, user token à générer"},
        {"id": "linkedin", "name": "LinkedIn", "role": "Canal social",
         "status": "REGISTERED", "token": "present" if _has("LINKEDIN_ACCESS_TOKEN") else "missing", "note": "setup requis"},
    ]


DEPRECATED = [
    {"id": "youtube_analytics_mcp", "reason": "DEPRECATED — ne pas utiliser comme source"},
    {"id": "heygen_creator", "reason": "DEPRECATED — brique avatar = Hedra / Fal-LatentSync / Wav2Lip"},
]

PUBLISH_LOCK = {"allowed": False, "reason": "§18 — drafts only, publication = GO Erwin nominatif"}


def status() -> dict:
    return {"ok": True, "source_tag": "NY_COFIAPUB_DISTRIBUTION_20260529",
            "publish_lock": PUBLISH_LOCK, "platforms": platforms(), "deprecated": DEPRECATED}
