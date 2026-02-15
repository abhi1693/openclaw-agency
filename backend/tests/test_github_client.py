from __future__ import annotations

from app.services.github.client import parse_pull_request_url


def test_parse_pull_request_url_empty_is_none() -> None:
    assert parse_pull_request_url("") is None
    assert parse_pull_request_url("   ") is None


def test_parse_pull_request_url_non_github_is_none() -> None:
    assert parse_pull_request_url("https://example.com/a/b/pull/1") is None
    assert parse_pull_request_url("https://github.com/a/b/issues/1") is None


def test_parse_pull_request_url_valid_https_returns_canonical() -> None:
    pr = parse_pull_request_url("https://github.com/acme/widgets/pull/123")
    assert pr is not None
    assert pr.owner == "acme"
    assert pr.repo == "widgets"
    assert pr.number == 123
    assert pr.url == "https://github.com/acme/widgets/pull/123"


def test_parse_pull_request_url_http_normalizes_to_canonical() -> None:
    pr = parse_pull_request_url("http://github.com/acme/widgets/pull/123")
    assert pr is not None
    assert pr.url == "https://github.com/acme/widgets/pull/123"


def test_parse_pull_request_url_invalid_number_is_none() -> None:
    assert parse_pull_request_url("https://github.com/acme/widgets/pull/0") is None
    assert parse_pull_request_url("https://github.com/acme/widgets/pull/-1") is None
    assert parse_pull_request_url("https://github.com/acme/widgets/pull/not-a-number") is None


def test_parse_pull_request_url_extra_segments_still_parses() -> None:
    pr = parse_pull_request_url("https://github.com/acme/widgets/pull/123/files")
    assert pr is not None
    assert pr.url == "https://github.com/acme/widgets/pull/123"
