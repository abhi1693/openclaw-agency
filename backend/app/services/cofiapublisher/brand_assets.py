"""CofiaPublisher — BRAND LAYER (injecté dans CHAQUE vidéo, non négociable).

source_tag: NY_COFIAPUB_BRAND_LAYER_20260529
Logo COF · mascottes CorsiKaan/KatiKaan · outro V20→V30 immutable · brand kit tokens.
Erwin 2026-05-29 : ces assets sont la signature de marque, présents sur toute production.
"""
from __future__ import annotations

import json
import os

BRAND = {
    "logo_official": "/Users/burakokyay/.openclaw/content/brand-kit/logos-png/cof-logo-official.png",
    "logo_remotion": "/Users/burakokyay/cof-trading/remotion/public/brand/cofiatrading-logo-official.png",
    "logo_horizontal": "/Users/burakokyay/cof-trading/cofiatrading-site/public/brand/cofiatrading-logo-horizontal-2400x900.png",
    "mascot_katikaan": "/Users/burakokyay/cof-trading/hub/assets/mascottes/katikaan.svg",
    "mascot_corsikaan": "/Users/burakokyay/cof-trading/hub/assets/mascottes/corsikaan.svg",
    "brand_manifest": "/Users/burakokyay/cof-trading/campaigns/assets/cofiatrading_brand_manifest.json",
    "brand_kit_md": "/Users/burakokyay/cof-trading/brand-kit-2026-05.md",
    "outro_component": "/Users/burakokyay/cof-trading/remotion/src/components/OutroCTA.tsx",
}


def verify() -> dict:
    """Présence réelle de chaque asset de marque (preuve, pas d'invention)."""
    return {k: os.path.exists(v) for k, v in BRAND.items()}


def tokens() -> dict:
    """Charge les tokens de marque (couleurs/logos/watermark) depuis le manifest canon."""
    try:
        with open(BRAND["brand_manifest"], encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}
