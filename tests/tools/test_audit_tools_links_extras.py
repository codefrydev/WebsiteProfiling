"""Tests for link edge audit tools and export extras."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from website_profiling.tools.audit_tools.context import AuditToolContext
from website_profiling.tools.audit_tools.export.export_extras import export_sitemap_xml, validate_rich_results
from website_profiling.tools.audit_tools.links.links import (
    get_inlink_anchors,
    get_link_rel_summary,
    list_broken_link_sources,
    list_nofollow_internal_links,
)


@pytest.fixture
def ctx():
    return AuditToolContext(property_id=1)


def test_link_tools_with_rich_edges(ctx):
    payload = {
        "issues": {"broken": [{"url": "https://example.com/broken"}]},
        "graph_edges": [
            {"from": "https://example.com/", "to": "https://example.com/broken"},
            ["https://example.com/a", "https://example.com/broken"],
            "skip",
        ],
        "link_edges": [
            {
                "from_url": "https://example.com/",
                "to_url": "https://example.com/x",
                "anchor_text": "X",
                "link_type": "internal",
                "is_nofollow": True,
            }
        ],
        "inlink_anchor_matrix": [
            {"target_url": "https://example.com/x", "anchor_text": "X", "inlink_count": 2},
            {"target_url": "https://example.com/y", "anchor_text": "Y", "inlink_count": 1},
        ],
    }
    conn = MagicMock()
    scoped = MagicMock()
    scoped.load_payload.return_value = payload
    ctx.with_args = MagicMock(return_value=scoped)

    broken = list_broken_link_sources(conn, ctx, {"limit": 10})
    assert broken["sources"][0]["source_count"] >= 2

    rel = get_link_rel_summary(conn, ctx, {})
    assert rel["total_edges"] == 1

    anchors = get_inlink_anchors(conn, ctx, {"url": "https://example.com/x"})
    assert len(anchors["rows"]) == 1

    nofollow = list_nofollow_internal_links(conn, ctx, {})
    assert nofollow["links"][0]["is_nofollow"] is True


def test_get_link_rel_summary_uses_payload_summary(ctx):
    conn = MagicMock()
    scoped = MagicMock()
    scoped.load_payload.return_value = {"link_rel_summary": {"total_edges": 9}}
    ctx.with_args = MagicMock(return_value=scoped)
    assert get_link_rel_summary(conn, ctx, {})["total_edges"] == 9


def test_export_extras_empty_payload(ctx):
    conn = MagicMock()
    ctx.load_payload = MagicMock(return_value={})
    assert export_sitemap_xml(conn, ctx, {})["error"] == "report not found"
    assert validate_rich_results(conn, ctx, {})["error"] == "report not found"


def test_export_sitemap_xml_tool(ctx, monkeypatch):
    conn = MagicMock()
    scoped = MagicMock()
    scoped.load_payload.return_value = {"links": [{"url": "https://example.com/", "status": "200"}]}
    ctx.load_payload = scoped.load_payload
    monkeypatch.setattr(
        "website_profiling.tools.audit_tools.export.export_extras.save_artifact",
        lambda content, **kwargs: {"path": "/tmp/sitemap.xml", "filename": kwargs.get("filename")},
    )
    out = export_sitemap_xml(conn, ctx, {})
    assert out["url_count"] == 1


def test_validate_rich_results_tool(ctx):
    conn = MagicMock()
    scoped = MagicMock()
    scoped.load_payload.return_value = {
        "links": [{"url": "https://example.com/", "status": "200", "has_schema": True, "page_analysis": {}}]
    }
    ctx.load_payload = scoped.load_payload
    out = validate_rich_results(conn, ctx, {"limit": 5})
    assert out["count"] == 1
    assert out["rows"][0]["provenance"] == "Crawl analysis"


def test_validate_rich_results_ignores_credential_errors(ctx, monkeypatch):
    conn = MagicMock()
    ctx.load_payload = MagicMock(return_value={
        "links": [{"url": "https://example.com/", "status": "200", "has_schema": True, "page_analysis": {}}],
    })
    monkeypatch.setattr(
        "website_profiling.integrations.google.auth.build_credentials",
        MagicMock(side_effect=RuntimeError("no creds")),
    )
    out = validate_rich_results(conn, ctx, {"limit": 5})
    assert out["count"] == 1
    assert out["provenance"] == "Crawl analysis"
