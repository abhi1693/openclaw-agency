# ruff: noqa: INP001
"""Regression tests for H10 schema compatibility loaders."""

import json
import os
import tempfile
from pathlib import Path

import pytest

from app.services.campaign_builder import (
    _load_h10_keywords,
    _load_h10_competitors as _cb_load_h10_competitors,
)
from app.services.campaign_optimizer import (
    _load_h10_competitors as _co_load_h10_competitors,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mktmpasin(tmp_path, asin: str = "TESTASIN123") -> Path:
    """Return a tmp dir structured like ~/.openclaw/skills/h10-browser/data/by-asin/{asin}."""
    base = tmp_path / asin
    base.mkdir(parents=True)
    return base


# ---------------------------------------------------------------------------
# _load_h10_keywords
# ---------------------------------------------------------------------------

class TestLoadH10Keywords:
    def test_new_object_schema(self, tmp_path, monkeypatch):
        """Current H10 writes { asin, updated, total_keyword_gap, keywords: [...] }."""
        asin_dir = _mktmpasin(tmp_path)
        kw_dir = asin_dir / "keywords"
        kw_dir.mkdir()

        payload = {
            "asin": "TESTASIN123",
            "updated": "2026-03-03",
            "total_keyword_gap": 42,
            "keywords": [
                {"term": "dog harness", "rank": 3, "exact_monthly_searches": 1200},
                {"term": "large dog harness", "rank": 8, "exact_monthly_searches": 850},
            ],
        }
        (kw_dir / "keyword_gap.json").write_text(json.dumps(payload))
        monkeypatch.setattr(
            "app.services.campaign_builder._H10_BASE", str(tmp_path)
        )

        result = _load_h10_keywords("TESTASIN123")

        assert len(result) == 2
        assert result[0]["term"] == "dog harness"
        assert result[1]["rank"] == 8

    def test_legacy_list_schema(self, tmp_path, monkeypatch):
        """Old H10 wrote top-level JSON list of keyword dicts."""
        asin_dir = _mktmpasin(tmp_path)
        kw_dir = asin_dir / "keywords"
        kw_dir.mkdir()

        payload = [
            {"term": "cat leash", "rank": 1},
            {"term": "retractable cat leash", "rank": 5},
        ]
        (kw_dir / "cerebro.json").write_text(json.dumps(payload))

        # Patch _H10_BASE to our temp directory
        import app.services.campaign_builder as cb
        monkeypatch.setattr(cb, "_H10_BASE", str(tmp_path))

        result = _load_h10_keywords("TESTASIN123")

        assert len(result) == 2
        assert result[0]["term"] == "cat leash"

    def test_mixed_object_and_list_files(self, tmp_path, monkeypatch):
        """Directory with both object-schema and list-schema files — both read."""
        asin_dir = _mktmpasin(tmp_path)
        kw_dir = asin_dir / "keywords"
        kw_dir.mkdir()

        (kw_dir / "obj_schema.json").write_text(json.dumps({
            "asin": "X", "updated": "X", "keywords": [{"term": "from-object"}]
        }))
        (kw_dir / "list_schema.json").write_text(json.dumps([{"term": "from-list"}]))

        monkeypatch.setattr(
            "app.services.campaign_builder._H10_BASE", str(tmp_path)
        )

        result = _load_h10_keywords("TESTASIN123")
        terms = [r["term"] for r in result]
        assert "from-object" in terms
        assert "from-list" in terms

    def test_empty_keywords_array(self, tmp_path, monkeypatch):
        """Object schema with empty keywords list returns empty."""
        asin_dir = _mktmpasin(tmp_path)
        kw_dir = asin_dir / "keywords"
        kw_dir.mkdir()
        (kw_dir / "kw.json").write_text(json.dumps({
            "asin": "X", "updated": "X", "keywords": []
        }))
        monkeypatch.setattr(
            "app.services.campaign_builder._H10_BASE", str(tmp_path)
        )
        assert _load_h10_keywords("TESTASIN123") == []


# ---------------------------------------------------------------------------
# _load_h10_competitors (campaign_builder)
# ---------------------------------------------------------------------------

class TestLoadH10CompetitorsCampaignBuilder:
    def test_new_object_schema(self, tmp_path, monkeypatch):
        """Current competitors.json is { updated, competitors: [...] }."""
        asin_dir = _mktmpasin(tmp_path)

        payload = {
            "updated": "2026-03-03",
            "source_keywords": [],
            "total_competitors": 50,
            "competitors": [
                {"asin": "B0CGRW1MMC", "title": "", "brand": "", "keyword_frequency": 1},
                {"asin": "B0DHBYM6L9", "title": "", "brand": "", "keyword_frequency": 1},
                {"asin": "B0FAKEFAKE0", "title": "", "brand": "", "keyword_frequency": 1},
            ],
        }
        (asin_dir / "competitors.json").write_text(json.dumps(payload))
        monkeypatch.setattr(
            "app.services.campaign_builder._H10_BASE", str(tmp_path)
        )

        result = _cb_load_h10_competitors("TESTASIN123")

        assert len(result) == 3
        assert "B0CGRW1MMC" in result
        assert "B0DHBYM6L9" in result

    def test_legacy_list_schema(self, tmp_path, monkeypatch):
        """Old competitors.json was a top-level list of { asin } dicts."""
        asin_dir = _mktmpasin(tmp_path)

        payload = [
            {"asin": "B0OLD1STOLD"},
            {"asin": "B0OLDSECOND"},
            {"asin": "B0OLDTHIRD"},
        ]
        (asin_dir / "competitors.json").write_text(json.dumps(payload))
        monkeypatch.setattr(
            "app.services.campaign_builder._H10_BASE", str(tmp_path)
        )

        result = _cb_load_h10_competitors("TESTASIN123")

        assert len(result) == 3
        assert "B0OLD1STOLD" in result

    def test_takes_top_10_only(self, tmp_path, monkeypatch):
        """Even with many competitors, return at most 10."""
        asin_dir = _mktmpasin(tmp_path)
        competitors = [{"asin": f"B0TEST{i:04d}"} for i in range(25)]
        (asin_dir / "competitors.json").write_text(json.dumps({
            "updated": "X", "competitors": competitors
        }))
        monkeypatch.setattr(
            "app.services.campaign_builder._H10_BASE", str(tmp_path)
        )

        result = _cb_load_h10_competitors("TESTASIN123")

        assert len(result) == 10
        assert result[-1] == "B0TEST0009"

    def test_missing_file_returns_empty(self, tmp_path, monkeypatch):
        """Non-existent competitors.json returns empty list."""
        monkeypatch.setattr(
            "app.services.campaign_builder._H10_BASE", str(tmp_path)
        )
        assert _cb_load_h10_competitors("NONEXISTENTASIN") == []


# ---------------------------------------------------------------------------
# _load_h10_competitors (campaign_optimizer — same fix)
# ---------------------------------------------------------------------------

class TestLoadH10CompetitorsCampaignOptimizer:
    def test_new_object_schema(self, tmp_path, monkeypatch):
        """campaign_optimizer._load_h10_competitors also handles object schema."""
        asin_dir = _mktmpasin(tmp_path)
        payload = {
            "updated": "2026-03-03",
            "competitors": [
                {"asin": "B0OPTIMIZER1"},
                {"asin": "B0OPTIMIZER2"},
            ],
        }
        (asin_dir / "competitors.json").write_text(json.dumps(payload))
        monkeypatch.setattr(
            "app.services.campaign_optimizer._H10_BASE", str(tmp_path)
        )

        result = _co_load_h10_competitors("TESTASIN123")

        assert len(result) == 2
        assert "B0OPTIMIZER1" in result

    def test_legacy_list_schema(self, tmp_path, monkeypatch):
        """campaign_optimizer._load_h10_competitors still accepts legacy list."""
        asin_dir = _mktmpasin(tmp_path)
        payload = [{"asin": "B0LEGCY0001"}, {"asin": "B0LEGCY0002"}]
        (asin_dir / "competitors.json").write_text(json.dumps(payload))
        monkeypatch.setattr(
            "app.services.campaign_optimizer._H10_BASE", str(tmp_path)
        )

        result = _co_load_h10_competitors("TESTASIN123")

        assert len(result) == 2
        assert "B0LEGCY0001" in result
