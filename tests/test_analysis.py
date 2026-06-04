"""Tests for local content analysis."""
from __future__ import annotations

import pandas as pd

from website_profiling.analysis.local import compute_duplicate_groups, simhash_64


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
    groups, url_gid = compute_duplicate_groups(df, cfg)
    assert len(groups) >= 1
    assert url_gid.get("https://example.com/a") == url_gid.get("https://example.com/b")
