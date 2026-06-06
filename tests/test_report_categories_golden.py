"""Golden tests: crawl-like input produces stable category issue fingerprints."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from website_profiling.reporting.categories import build_categories, merge_indexation_issues

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "report"


def _issue_fingerprints(categories: list[dict]) -> set[tuple[str, str, str]]:
    out: set[tuple[str, str, str]] = set()
    for cat in categories:
        cat_id = str(cat.get("id") or "")
        for issue in cat.get("issues") or []:
            msg = str(issue.get("message") or "").lower()
            priority = str(issue.get("priority") or "")
            out.add((cat_id, msg[:80], priority))
    return out


def test_build_categories_golden_fingerprints() -> None:
    rows = json.loads((FIXTURES / "minimal_crawl.json").read_text(encoding="utf-8"))
    df = pd.DataFrame(rows)
    edges = [
        ("https://example.com/", "https://example.com/thin"),
        ("https://example.com/a", "https://example.com/broken"),
    ]
    summary_seo = {
        "issues": {
            "broken": [{"url": "https://example.com/broken", "status": "404"}],
            "redirects": [{"url": "https://example.com/redirect", "status": "301", "final_url": "https://example.com/"}],
        }
    }
    site_level = {"robots_present": True, "sitemap_present": True, "sitemap_valid": True}
    lh = {"median_metrics": {"performance_score": 0.85}, "top_failures": []}
    crux = {"ok": True, "pass": {"lcp": False, "inp": True, "cls": True}}

    categories = build_categories(
        df,
        edges,
        summary_seo,
        site_level,
        "https://example.com/",
        lighthouse_summary=lh,
        crux_summary=crux,
    )

    fps = _issue_fingerprints(categories)
    assert any("self-referencing" in b for _, b, _ in fps)
    assert any("noindex" in b for _, b, _ in fps)
    assert any("soft 404" in b for _, b, _ in fps)
    assert any("broken url" in b for _, b, _ in fps)
    assert any("crux" in b for _, b, _ in fps)

    indexation = {
        "lists": {"sitemap_only": ["https://example.com/missing-page"]},
        "sitemap_urls": ["https://example.com/", "https://example.com/missing-page"],
    }
    merge_indexation_issues(categories, df, indexation)
    merged_fps = _issue_fingerprints(categories)
    assert any("not crawled" in b for _, b, _ in merged_fps)

    ids = {c["id"] for c in categories}
    assert ids >= {"technical_seo", "core_web_vitals", "link_health", "security", "performance"}
