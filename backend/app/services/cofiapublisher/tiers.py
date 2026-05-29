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
    "video": {Tier.ECONOMY: "stock_pexels", Tier.MEDIUM: "kling_fal", Tier.PREMIUM: "veo_vertex"},
    "avatar": {Tier.ECONOMY: "wav2lip_local", Tier.MEDIUM: "latentsync_fal", Tier.PREMIUM: "hedra"},
    "music": {Tier.ECONOMY: "musicgen_local", Tier.MEDIUM: "suno", Tier.PREMIUM: "suno_v5"},
    "captions": {Tier.ECONOMY: "whisper_local", Tier.MEDIUM: "whisper_local", Tier.PREMIUM: "whisper_local"},
    "qa": {Tier.ECONOMY: "perception_v3", Tier.MEDIUM: "perception_v3", Tier.PREMIUM: "claude_vision"},
}

# Coût indicatif EUR par vidéo ~60s (estimation, affiché avant lancement).
TIER_COST_EUR = {Tier.ECONOMY: 0.04, Tier.MEDIUM: 2.0, Tier.PREMIUM: 14.0}


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
