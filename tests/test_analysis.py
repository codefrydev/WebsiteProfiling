"""Tests for local content analysis."""
from __future__ import annotations

import pandas as pd

from website_profiling.analysis.local import compute_duplicate_groups, run_local_enrichment, simhash_64


def test_simhash_identical_text_same_hash():
    t = "hello world " * 10
    assert simhash_64(t) == simhash_64(t)


def test_duplicate_groups_fuzzy_merge():
    df = pd.DataFrame(
        [
            {
                "url": "https://example.com/a",
                "status": "200",
                "content_type": "text/html",
                "title": "Best SEO Tools Guide",
                "meta_description": "A guide to SEO tools for marketers",
                "h1": "SEO Tools",
                "content_excerpt": " ".join(["seo tools"] * 50),
            },
            {
                "url": "https://example.com/b",
                "status": "200",
                "content_type": "text/html",
                "title": "Best SEO Tools Guide",
                "meta_description": "A guide to SEO tools for marketers",
                "h1": "SEO Tools",
                "content_excerpt": " ".join(["seo tools"] * 50),
            },
        ]
    )
    cfg = {
        "enable_duplicate_detection": "true",
        "analysis_fuzzy_threshold": "90",
        "analysis_dup_max_pages": "100",
    }
    groups, url_gid, warnings = compute_duplicate_groups(df, cfg)
    assert len(groups) >= 1
    assert url_gid.get("https://example.com/a") == url_gid.get("https://example.com/b")
    assert warnings == []


def test_duplicate_groups_include_pdf_content_type():
    df = pd.DataFrame(
        [
            {
                "url": "https://example.com/report",
                "status": "200",
                "content_type": "text/html",
                "title": "Annual Report 2026",
                "meta_description": "Company annual report",
                "h1": "Annual Report",
                "content_excerpt": " ".join(["annual report content"] * 50),
            },
            {
                "url": "https://example.com/report.pdf",
                "status": "200",
                "content_type": "application/pdf",
                "title": "Annual Report 2026",
                "meta_description": "",
                "h1": "",
                "content_excerpt": " ".join(["annual report content"] * 50),
            },
        ]
    )
    cfg = {
        "enable_duplicate_detection": "true",
        "analysis_fuzzy_threshold": "90",
        "analysis_dup_max_pages": "100",
    }
    groups, url_gid, _warnings = compute_duplicate_groups(df, cfg)
    assert len(groups) >= 1
    assert url_gid.get("https://example.com/report") == url_gid.get(
        "https://example.com/report.pdf"
    )


def test_duplicate_groups_emit_warnings_when_url_caps_exceeded(monkeypatch) -> None:
    monkeypatch.setattr(
        "website_profiling.analysis.local._import_rapidfuzz",
        lambda: type("F", (), {"token_set_ratio": staticmethod(lambda _a, _b: 0)})(),
    )
    rows = []
    for i in range(3):
        rows.append(
            {
                "url": f"https://example.com/p{i}",
                "status": "200",
                "content_type": "text/html",
                "title": f"Unique page title number {i}",
                "meta_description": "desc",
                "h1": "h1",
                "content_excerpt": " ".join(["content"] * 50),
            }
        )
    df = pd.DataFrame(rows)
    cfg = {
        "enable_duplicate_detection": "true",
        "analysis_simhash_hamming": "3",
        "analysis_simhash_max_urls": "1",
        "analysis_fuzzy_max_urls": "1",
    }
    _groups, _url_gid, warnings = compute_duplicate_groups(df, cfg)
    assert any("SimHash" in w for w in warnings)
    assert any("fuzzy" in w for w in warnings)

    bundle = run_local_enrichment(df, cfg)
    assert any("SimHash" in w for w in bundle.get("ml_errors") or [])
