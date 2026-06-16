"""Tests for audit_tools registry and issue/page queries."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from website_profiling.tools.audit_tools import AuditToolContext, dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.audit_tools.registry import TOOL_DEFINITIONS, openai_tools_schema
from website_profiling.tools.audit_tools.report import (
    get_category_scores,
    get_report_summary,
    list_issues,
)


def _sample_payload() -> dict:
    return {
        "site_name": "Example",
        "report_generated_at": "2026-06-07T12:00:00Z",
        "crawl_run_id": 9,
        "summary": {"total_urls": 10, "count_2xx": 8, "count_4xx": 2},
        "lighthouse_summary": {"performance": 72},
        "lighthouse_human_summary": "OK",
        "lighthouse_diagnostics": [{"id": "x"}],
        "lighthouse_by_url": {
            "https://ex.com/slow": {"performance": 40},
            "https://ex.com/ok": {"performance": 90},
        },
        "google": {"fetched_at": "2026-06-07", "gsc": {"summary": {"clicks": 1}}},
        "keywords": {
            "fetched_at": "2026-06-07",
            "total_keywords": 2,
            "rows": [{"keyword": "widgets", "score": 0.5, "gsc_clicks": 3}],
            "striking_distance": [{"keyword": "repair"}],
        },
        "categories": [
            {
                "id": "technical_seo",
                "name": "Technical SEO",
                "score": 80,
                "issues": [
                    {"priority": "Critical", "message": "Missing title", "url": "https://ex.com/a", "recommendation": "Add title"},
                    {"priority": "High", "message": "Slow page", "url": "https://ex.com/blog/slow", "recommendation": "Optimize"},
                    {"priority": "Low", "message": "Minor", "url": "https://ex.com/z", "recommendation": "Fix"},
                ],
            },
            {
                "id": "link_health",
                "name": "Links",
                "score": 70,
                "issues": [
                    {"priority": "High", "message": "Broken link", "url": "https://ex.com/404", "recommendation": "Fix link"},
                ],
            },
            "not-a-dict",
        ],
    }


def test_tool_definitions_have_required_fields() -> None:
    for tool in TOOL_DEFINITIONS:
        assert tool.get("name")
        assert tool.get("description")
        assert "inputSchema" in tool


def test_openai_tools_schema() -> None:
    schema = openai_tools_schema()
    assert len(schema) == len(TOOL_DEFINITIONS)
    assert schema[0]["type"] == "function"


def test_openai_tools_schema_context_scoped_strips_property_id() -> None:
    schema = openai_tools_schema({"run_technical_workflow"}, context_scoped=True)
    assert len(schema) == 1
    params = schema[0]["function"]["parameters"]
    assert "property_id" not in params.get("properties", {})
    assert "report_id" not in params.get("properties", {})
    assert "property_id" not in (params.get("required") or [])


def test_dispatch_unknown_tool() -> None:
    conn = MagicMock()
    result = dispatch_tool("nonexistent", {}, conn=conn)
    assert result["error"] == "unknown tool: nonexistent"


def test_dispatch_via_db_session() -> None:
    conn = MagicMock()
    with patch("website_profiling.tools.audit_tools.registry.db_session") as mock_sess:
        mock_sess.return_value.__enter__.return_value = conn
        with patch(
            "website_profiling.tools.audit_tools.properties.list_properties_public",
            return_value=[],
        ):
            result = dispatch_tool("list_properties", {})
    assert result["count"] == 0


def test_context_with_args_and_loaders() -> None:
    conn = MagicMock()
    ctx = Ctx(property_id=1, report_id=2)
    merged = ctx.with_args({"property_id": 3, "report_id": 4})
    assert merged.property_id == 3
    assert merged.report_id == 4

    with patch(
        "website_profiling.tools.audit_tools.context.read_report_payload",
        return_value=_sample_payload(),
    ):
        payload = ctx.load_payload(conn)
        assert payload["site_name"] == "Example"

    df = pd.DataFrame([{"url": "https://ex.com", "status": "200"}])
    with patch(
        "website_profiling.tools.audit_tools.context.read_report_payload",
        return_value=_sample_payload(),
    ), patch(
        "website_profiling.tools.audit_tools.context.read_crawl",
        return_value=df,
    ):
        assert not ctx.load_crawl_df(conn).empty

    with patch(
        "website_profiling.tools.audit_tools.context.read_latest_google_data",
        return_value={"gsc": {}},
    ):
        assert ctx.load_google(conn) is not None

    with patch(
        "website_profiling.tools.audit_tools.context.read_latest_google_data",
        return_value=None,
    ), patch(
        "website_profiling.tools.audit_tools.context.read_report_payload",
        return_value=_sample_payload(),
    ):
        assert ctx.load_google(conn)["gsc"]["summary"]["clicks"] == 1

    with patch(
        "website_profiling.tools.audit_tools.context.read_latest_keyword_data",
        return_value={"rows": []},
    ):
        assert ctx.load_keywords(conn) is not None


def test_list_issues_filtering_and_limit() -> None:
    conn = MagicMock()
    ctx = AuditToolContext()
    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        all_issues = list_issues(conn, ctx, {})
    assert all_issues["total"] == 4

    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        critical = list_issues(conn, ctx, {"priority": "Critical"})
    assert critical["total"] == 1

    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        blog = list_issues(conn, ctx, {"url_contains": "/blog"})
    assert blog["total"] == 1

    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        capped = list_issues(conn, ctx, {"limit": 2})
    assert capped["truncated"] is True


def test_list_issues_empty_report() -> None:
    conn = MagicMock()
    with patch.object(Ctx, "load_payload", return_value={}):
        result = list_issues(conn, AuditToolContext(), {})
    assert result["error"] == "no report found"


def test_get_report_summary_and_categories() -> None:
    conn = MagicMock()
    ctx = AuditToolContext()
    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        summary = get_report_summary(conn, ctx, {})
    assert summary["health_score"] == 75
    assert summary["total_issues"] == 4

    with patch.object(Ctx, "load_payload", return_value={}):
        empty = get_category_scores(conn, ctx, {})
    assert empty["error"] == "no report found"

    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        cats = get_category_scores(conn, ctx, {})
    assert len(cats["categories"]) == 2


def test_properties_tools() -> None:
    conn = MagicMock()
    with patch(
        "website_profiling.tools.audit_tools.properties.list_properties_public",
        return_value=[{"id": 1}],
    ):
        assert dispatch_tool("list_properties", {}, conn=conn)["count"] == 1

    with patch(
        "website_profiling.tools.audit_tools.properties.get_property_by_id",
        return_value=None,
    ):
        missing = dispatch_tool("get_property", {"property_id": 9}, conn=conn)
    assert "not found" in missing["error"]

    with patch(
        "website_profiling.tools.audit_tools.properties.get_property_by_id",
        return_value={"id": 1, "name": "ex.com", "canonical_domain": "ex.com"},
    ):
        ok = dispatch_tool("get_property", {"property_id": 1}, conn=conn)
    assert ok["property"]["id"] == 1

    assert dispatch_tool("get_property", {}, context=AuditToolContext(), conn=conn)["error"]


def test_crawl_tools() -> None:
    conn = MagicMock()
    df = pd.DataFrame([
        {"url": "https://ex.com/ok", "status": "200", "title": "OK", "inlinks": 3},
        {"url": "https://ex.com/missing", "status": "404", "title": "", "inlinks": 0},
    ])
    ctx = AuditToolContext(property_id=1)
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        pages = dispatch_tool("search_pages", {"status": "404"}, context=ctx, conn=conn)
    assert pages["total"] == 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()), patch.object(
        Ctx, "load_payload", return_value=_sample_payload(),
    ), patch(
        "website_profiling.tools.audit_tools.crawl.slice_from_google_row",
        return_value={"gsc": {"clicks": 1}},
    ):
        detail = dispatch_tool(
            "get_page_details",
            {"url": "https://ex.com/ok"},
            context=ctx,
            conn=conn,
        )
    assert detail["found_in_crawl"] is False

    with patch(
        "website_profiling.db.crawl_store.read_edges",
        return_value=[("https://ex.com", "https://ex.com/child")],
    ), patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        links = dispatch_tool(
            "get_internal_links",
            {"url": "https://ex.com"},
            context=ctx,
            conn=conn,
        )
    assert links["outlink_count"] == 1

    assert dispatch_tool("get_page_details", {}, context=ctx, conn=conn)["error"]


def test_lighthouse_keywords_google_health() -> None:
    conn = MagicMock()
    ctx = AuditToolContext(property_id=1, report_id=1)
    df = pd.DataFrame([
        {"url": "https://ex.com/ok", "status": "200", "title": "OK", "inlinks": 3},
        {"url": "https://ex.com/missing", "status": "404", "title": "", "inlinks": 0},
    ])

    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        lh = dispatch_tool("get_lighthouse_summary", {}, context=ctx, conn=conn)
    assert lh["pages_audited"] == 2
    assert lh["poor_performance_pages"]

    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        url_lh = dispatch_tool(
            "get_lighthouse_for_url",
            {"url": "https://ex.com/slow"},
            context=ctx,
            conn=conn,
        )
    assert url_lh["lighthouse"]["performance"] == 40

    with patch.object(Ctx, "load_keywords", return_value=_sample_payload()["keywords"]):
        kw = dispatch_tool("get_keyword_summary", {"property_id": 1}, context=ctx, conn=conn)
    assert kw["total_keywords"] == 2

    with patch.object(Ctx, "load_keywords", return_value=_sample_payload()["keywords"]):
        search = dispatch_tool(
            "search_keywords",
            {"property_id": 1, "query": "widget"},
            context=ctx,
            conn=conn,
        )
    assert search["total"] == 1

    with patch.object(Ctx, "load_google", return_value={
        "fetched_at": "x",
        "gsc": {"summary": {"clicks": 5}, "top_queries": [], "top_pages": []},
        "ga4": {"summary": {"sessions": 10}, "top_pages": []},
    }):
        g = dispatch_tool("get_google_summary", {}, context=ctx, conn=conn)
    assert g["gsc"]["summary"]["clicks"] == 5

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    conn.set_next_cursor = lambda cur: None  # type: ignore
    from tests.db_test_fakes import FakeConn, FakeCursor

    fake = FakeConn()
    fake.set_next_cursor(
        FakeCursor(
            fetchall_value=[{
                "health_score": 80,
                "category_scores": "{}",
                "issue_counts": "{}",
                "generated_at": now,
                "report_id": 1,
            }],
        ),
    )
    hist = dispatch_tool("get_health_history", {"property_id": 1}, conn=fake)
    assert hist["count"] == 1

    assert dispatch_tool("get_keyword_summary", {}, context=AuditToolContext(), conn=conn)["error"]
    assert dispatch_tool("search_keywords", {"property_id": 1}, context=ctx, conn=conn)["error"]

    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        miss_lh = dispatch_tool("get_lighthouse_for_url", {"url": "https://ex.com/none"}, context=ctx, conn=conn)
    assert "error" in miss_lh

    with patch.object(Ctx, "load_google", return_value=None):
        no_g = dispatch_tool("get_google_summary", {}, context=ctx, conn=conn)
    assert no_g["error"]

    assert dispatch_tool("get_health_history", {}, context=AuditToolContext(), conn=conn)["error"]

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        url_search = dispatch_tool("search_pages", {"url_contains": "missing"}, context=ctx, conn=conn)
    assert url_search["total"] == 1

    with patch.object(Ctx, "load_crawl_df", return_value=df), patch.object(
        Ctx, "load_payload", return_value=_sample_payload(),
    ), patch(
        "website_profiling.tools.audit_tools.crawl.slice_from_google_row",
        return_value={},
    ):
        found = dispatch_tool(
            "get_page_details",
            {"url": "https://ex.com/ok"},
            context=ctx,
            conn=conn,
        )
    assert found["found_in_crawl"] is True

    assert dispatch_tool("get_internal_links", {}, context=ctx, conn=conn)["error"]

    bad_prop = dispatch_tool("get_property", {"property_id": "bad"}, conn=conn)
    assert bad_prop["error"] == "invalid property_id"

    with patch.object(Ctx, "load_payload", return_value=_sample_payload()):
        cat_filter = dispatch_tool(
            "list_issues",
            {"category_id": "technical_seo"},
            context=ctx,
            conn=conn,
        )
    assert cat_filter["total"] == 3
