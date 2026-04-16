# ruff: noqa: INP001
"""Smoke tests for H10 schema compat through campaign payload generation."""

import json

from app.services.campaign_builder import (
    _build_campaign_list,
    _load_h10_competitors,
    _load_h10_keywords,
)


def test_h10_schema_compat_generates_renderable_campaign_payloads(tmp_path, monkeypatch):
    asin = "TESTASIN123"
    asin_dir = tmp_path / asin
    keywords_dir = asin_dir / "keywords"
    keywords_dir.mkdir(parents=True)

    (keywords_dir / "object.json").write_text(json.dumps({
        "asin": asin,
        "keywords": [{"term": "dog harness", "exact_monthly_searches": 3200}],
    }))
    (keywords_dir / "flat.json").write_text(json.dumps([
        {"keyword": "cat leash", "search_volume": 1400},
    ]))
    (asin_dir / "competitors.json").write_text(json.dumps({
        "updated": "2026-04-16",
        "competitors": [{"asin": "B0COMPAT001"}],
    }))
    monkeypatch.setattr("app.services.campaign_builder._H10_BASE", str(tmp_path))

    campaigns = _build_campaign_list(
        asin=asin,
        strategy_key="grow",
        daily_budget=50,
        avg_cpc=1.0,
        min_bid=0.1,
        max_bid=4.0,
        search_term_kws=[],
        h10_kws=_load_h10_keywords(asin),
        competitor_asins=_load_h10_competitors(asin),
        target_acos=25,
    )

    exact_keywords = campaigns[0]["ad_groups"][0]["keywords"]
    assert [kw["keyword"] for kw in exact_keywords[:2]] == ["dog harness", "cat leash"]

    product_targets = next(c for c in campaigns if c["targeting"] == "product")["ad_groups"][0]["targets"]
    assert product_targets == [{"asin": "B0COMPAT001"}]
