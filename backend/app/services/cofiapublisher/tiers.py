"""CofiaPublisher — routeur de tiers (Économie / Medium / Premium) par modalité.

source_tag: NY_COFIAPUB_TIERS_20260529
Principe : local-first. Économie = défaut anti-gaspillage (§15). Cloud uniquement si tier choisi.
Aucun pipe Abidjan :8430. Spec : MASTER_SPEC_COFIAPUBLISHER.md.
"""
from __future__ import annotations

from enum import Enum


class Tier(str, Enum):
    ECONOMY = "economy"
    MEDIUM = "medium"
    PREMIUM = "premium"


# Modalité -> provider canonique par tier (voir matrice Spec Maître §3).
TIER_MAP: dict[str, dict[Tier, str]] = {
    "script": {Tier.ECONOMY: "qwen_local_11435", Tier.MEDIUM: "gemini_flash", Tier.PREMIUM: "claude_opus"},
    "voice": {Tier.ECONOMY: "xtts_local", Tier.MEDIUM: "openai_tts", Tier.PREMIUM: "elevenlabs"},
    "image": {Tier.ECONOMY: "stock_pexels", Tier.MEDIUM: "flux_fal", Tier.PREMIUM: "imagen3_google"},
    "thumbnail": {Tier.ECONOMY: "stock_pexels", Tier.MEDIUM: "ideogram", Tier.PREMIUM: "ideogram"},
    "video": {Tier.ECONOMY: "stock_pexels", Tier.MEDIUM: "kling_fal", Tier.PREMIUM: "veo_vertex"},
    "video_alt": {Tier.ECONOMY: "stock_pexels", Tier.MEDIUM: "seedance_fal", Tier.PREMIUM: "runway_gen4"},
    "avatar": {Tier.ECONOMY: "wav2lip_local", Tier.MEDIUM: "latentsync_fal", Tier.PREMIUM: "hedra"},
    "music": {Tier.ECONOMY: "musicgen_local", Tier.MEDIUM: "suno", Tier.PREMIUM: "suno"},
    "captions": {Tier.ECONOMY: "whisper_local", Tier.MEDIUM: "whisper_local", Tier.PREMIUM: "whisper_local"},
    "qa": {Tier.ECONOMY: "perception_v3", Tier.MEDIUM: "perception_v3", Tier.PREMIUM: "claude_vision"},
}

# Outils de design/montage NON-API : pilotés via MCP (Canva, Figma) ou manuels (CapCut).
# Le brand layer (logo, mascottes CorsiKaan/KatiKaan, outro V20->V30 immutable, tokens) = brand_assets.py.
DESIGN_TOOLS = {
    "canva": "MCP claude_ai_Canva (templates, export, brand kit)",
    "figma": "MCP claude_ai_Figma (brand kit, composants, design context)",
    "capcut": "MANUEL (finition humaine — pas d'API, étape optionnelle hors auto)",
}

# Coût indicatif EUR par vidéo ~60s (fallback grossier).
TIER_COST_EUR = {Tier.ECONOMY: 0.0, Tier.MEDIUM: 2.0, Tier.PREMIUM: 14.0}

# Tarifs unitaires approximatifs EUR (par seconde de vidéo générée ou par appel) — pour estimation réelle.
COST_RATES = {
    # provider: (eur_par_seconde_video, eur_par_appel_fixe)
    "elevenlabs": (0.0, 0.30), "openai_tts": (0.0, 0.10), "xtts_local": (0.0, 0.0), "say_local": (0.0, 0.0),
    "veo_vertex": (0.45, 0.0), "runway_gen4": (0.25, 0.0), "kling_fal": (0.12, 0.0), "seedance_fal": (0.10, 0.0),
    "stock_pexels": (0.0, 0.0), "flux_fal": (0.0, 0.03), "imagen3_google": (0.0, 0.04), "ideogram": (0.0, 0.08),
    "hedra": (0.15, 0.0), "latentsync_fal": (0.05, 0.0), "wav2lip_local": (0.0, 0.0),
    "musicgen_local": (0.0, 0.0), "suno": (0.0, 0.0),  # suno = crédits compte, pas €
    "claude_opus": (0.0, 0.05), "gemini_flash": (0.0, 0.005), "qwen_local_11435": (0.0, 0.0),
    "perception_v3": (0.0, 0.04), "claude_vision": (0.0, 0.10), "whisper_local": (0.0, 0.0), "remotion+ffmpeg_local": (0.0, 0.0),
}


def estimate_cost_eur(providers: list[str], duration_s: int = 60) -> float:
    """Estimation réelle = somme(provider: per_sec*durée + per_call) sur les providers du plan."""
    total = 0.0
    for p in providers:
        per_s, per_call = COST_RATES.get(p, (0.0, 0.0))
        total += per_s * duration_s + per_call
    return round(total, 2)


def provider_for(modality: str, tier: str | Tier) -> str:
    """Retourne le provider canonique pour une modalité + tier."""
    t = Tier(tier)
    if modality not in TIER_MAP:
        raise ValueError(f"unknown_modality:{modality}")
    return TIER_MAP[modality][t]


def plan_for(tier: str | Tier) -> dict[str, str]:
    """Plan complet (tous providers) pour un tier donné."""
    t = Tier(tier)
    return {modality: m[t] for modality, m in TIER_MAP.items()}
