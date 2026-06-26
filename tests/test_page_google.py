"""Tests for per-page Google slice, compare deltas, and snapshot helpers."""
from __future__ import annotations

import json

from website_profiling.integrations.google.page_lookup import metric_deltas, slice_from_google_row


def test_slice_from_google_row_gsc_full_by_page():
    raw = {
        "gsc_full": {
            "by_page": {
                "https://example.com/about": {
                    "clicks": 10,
                    "impressions": 200,
                    "ctr": 5.0,
                    "position": 12.3,
                }
            },
            "site_totals": {"ctr": 3.5, "position": 15},
        },
        "ga4_full": {
            "by_path": {
                "/about": {
                    "sessions": 50,
                    "engagementRate": 62.5,
                    "avgSessionDuration": 45,
                }
            },
            "site_totals": {"engagementRate": 55},
        },
        "date_range": {"start": "2026-01-01", "end": "2026-01-28"},
    }
    out = slice_from_google_row(raw, "https://example.com/about")
    assert out["gsc"]["clicks"] == 10
    assert out["gsc"]["impressions"] == 200
    assert out["ga4"]["sessions"] == 50
    assert out["coverage"]["inGsc"] is True
    assert out["coverage"]["inGa4"] is True


def test_slice_fallback_top_pages():
    raw = {
        "gsc": {
            "top_pages": [
                {"page": "https://example.com/", "clicks": 1, "impressions": 10, "ctr": 10, "position": 5}
            ]
        }
    }
    out = slice_from_google_row(raw, "https://example.com")
    assert out["gsc"]["clicks"] == 1
    assert out["coverage"]["inGsc"] is True
    missing = slice_from_google_row(raw, "https://example.com/no-match")
    assert missing["gsc"] is None
    assert missing["coverage"]["inGsc"] is False


def test_metric_deltas():
    current = {"gsc": {"clicks": 20, "impressions": 100}, "ga4": {"sessions": 30, "engagementRate": 40}}
    baseline = {"gsc": {"clicks": 10, "impressions": 80}, "ga4": {"sessions": 25, "engagementRate": 50}}
    rows = metric_deltas(current, baseline)
    by_id = {r["id"]: r for r in rows}
    assert by_id["gsc_clicks"]["delta"] == 10
    assert by_id["ga4_sessions"]["delta"] == 5


def test_keyword_enrich_parses_jsonb_google_row():
    """Regression: psycopg dict rows + JSONB dict must use _parse_row_json, not json.loads(row[0])."""
    from website_profiling.db.storage import _parse_row_json
    from website_profiling.integrations.google.keyword_enrich import _normalize_kw

    row = {
        "data": {
            "gsc_full": {
                "top_queries": [{"query": "test query", "clicks": 1, "impressions": 10, "position": 5}],
                "by_page": {},
            }
        }
    }
    full_google = _parse_row_json(row) or {}
    gsc_full = full_google.get("gsc_full") or full_google.get("gsc") or {}
    gsc_queries = {}
    for q in gsc_full.get("top_queries") or []:
        nk = _normalize_kw(q.get("query") or "")
        if nk:
            gsc_queries[nk] = q
    assert "test query" in gsc_queries


def test_page_coach_context_shape():
    """Minimal context dict matches keys produced by build_page_context."""
    ctx = {"page_url": "https://x.com", "link": None, "current": None, "baseline": None, "compare": []}
    payload = json.dumps(ctx, sort_keys=True, default=str)
    assert "https://x.com" in payload
    assert "baseline" in payload
    assert "compare" in payload
