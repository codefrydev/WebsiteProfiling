"""Tests for image audit tools."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from website_profiling.tools.audit_tools import dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.audit_tools.images.image_tools import IMAGE_LIGHTHOUSE_AUDIT_IDS


@pytest.fixture
def ctx() -> Ctx:
    return Ctx(property_id=1, report_id=1)


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


def _payload() -> dict:
    return {
        "social_coverage": {
            "og_image_coverage_pct": 80,
            "og_image_missing": ["https://ex.com/no-og"],
        },
        "content_urls": {
            "missing_alt": [{"url": "https://ex.com/alt", "images_without_alt": 2, "images_total": 3}],
            "missing_lazy": [{"url": "https://ex.com/lazy", "img_without_lazy": 1, "images_total": 2}],
            "missing_dimensions": [{"url": "https://ex.com/dim", "img_without_dimensions": 2, "images_total": 4}],
        },
        "lighthouse_diagnostics": [
            {"lighthouse_audit_id": "uses-optimized-images", "title": "Serve images in next-gen formats"},
            {"lighthouse_audit_id": "render-blocking-resources", "title": "Eliminate render-blocking"},
            {"lighthouse_audit_id": "image-alt", "title": "Image elements do not have alt"},
        ],
        "links": [
            {
                "url": "https://ex.com/",
                "og_image": "https://cdn.ex.com/og.png",
                "twitter_image": "https://cdn.ex.com/tw.png",
                "page_analysis": {"image_urls": ["https://cdn.ex.com/hero.jpg"]},
            },
        ],
        "image_inventory": [
            {
                "url": "https://cdn.ex.com/big.png",
                "size_bytes": 500_000,
                "content_type": "image/png",
                "source_pages": ["https://ex.com/"],
                "kinds": ["content"],
            },
            {
                "url": "https://cdn.ex.com/modern.webp",
                "size_bytes": 400_000,
                "content_type": "image/webp",
                "source_pages": ["https://ex.com/"],
                "kinds": ["content"],
            },
        ],
        "image_inventory_summary": {"probed": 2, "failed": 0, "unoptimized_min_kb": 200},
    }


def test_get_image_audit_summary(conn: MagicMock, ctx: Ctx) -> None:
    df = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "200", "images_without_alt": 1, "img_without_lazy": 0,
         "img_without_dimensions": 0, "images_total": 5},
    ])
    with patch.object(Ctx, "load_payload", return_value=_payload()), patch.object(Ctx, "load_crawl_df", return_value=df):
        summary = dispatch_tool("get_image_audit_summary", {}, context=ctx, conn=conn)
    # The crawl DataFrame is authoritative: it reports 1 page missing alt and 0
    # for lazy/dimensions, so a real 0 must NOT be replaced by a content_urls count.
    assert summary["pages_missing_alt"] == 1
    assert summary["pages_without_lazy_images"] == 0
    assert summary["pages_missing_image_dimensions"] == 0
    assert summary["images_total_crawled"] == 5
    assert summary["lighthouse_image_diagnostics"] == 2
    assert summary["image_inventory_available"] is True
    assert "page_previews" in summary
    assert summary["page_previews"]["missing_lazy"]["total"] >= 1

    # When the DataFrame is absent the count falls back to content_urls.
    with patch.object(Ctx, "load_payload", return_value=_payload()), patch.object(Ctx, "load_crawl_df", return_value=None):
        fb = dispatch_tool("get_image_audit_summary", {}, context=ctx, conn=conn)
    assert fb["pages_without_lazy_images"] == len(_payload().get("content_urls", {}).get("missing_lazy") or [])


def test_list_site_image_urls(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_payload", return_value=_payload()):
        all_items = dispatch_tool("list_site_image_urls", {}, context=ctx, conn=conn)
        assert all_items["total"] == 3
        og_only = dispatch_tool("list_site_image_urls", {"kind": "og"}, context=ctx, conn=conn)
        assert og_only["total"] == 1
        assert og_only["items"][0]["kind"] == "og"


def test_list_lighthouse_image_opportunities(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_payload", return_value=_payload()):
        result = dispatch_tool("list_lighthouse_image_opportunities", {}, context=ctx, conn=conn)
    assert result["total"] == 2
    ids = {d["lighthouse_audit_id"] for d in result["diagnostics"]}
    assert ids <= IMAGE_LIGHTHOUSE_AUDIT_IDS
    assert "render-blocking-resources" not in ids


def test_lazy_and_dimensions_lists_prefer_buckets(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_payload", return_value=_payload()), patch.object(Ctx, "load_crawl_df", return_value=None):
        lazy = dispatch_tool("list_pages_without_lazy_images", {}, context=ctx, conn=conn)
        dims = dispatch_tool("list_pages_with_images_missing_dimensions", {}, context=ctx, conn=conn)
    assert lazy["total"] == 1
    assert dims["total"] == 1


def test_inventory_tools(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_payload", return_value=_payload()):
        largest = dispatch_tool("list_largest_images", {"min_size_kb": 200}, context=ctx, conn=conn)
        assert largest["inventory_available"] is True
        assert largest["total"] >= 1
        unopt = dispatch_tool("list_unoptimized_images", {}, context=ctx, conn=conn)
        assert unopt["total"] == 1
        assert unopt["items"][0]["content_type"] == "image/png"
        attention = dispatch_tool("list_images_needing_attention", {}, context=ctx, conn=conn)
        assert attention["total"] >= 1
        assert attention["items"][0].get("reasons")


def test_inventory_missing_when_not_probed(conn: MagicMock, ctx: Ctx) -> None:
    payload = _payload()
    payload.pop("image_inventory")
    with patch.object(Ctx, "load_payload", return_value=payload):
        result = dispatch_tool("list_largest_images", {}, context=ctx, conn=conn)
    assert result["inventory_available"] is False
    assert "probe_image_inventory" in result["error"]


def test_all_image_tools_dispatch(conn: MagicMock, ctx: Ctx) -> None:
    df = pd.DataFrame([{"url": "https://ex.com/a", "status": "200", "img_without_lazy": 1, "img_without_dimensions": 1}])
    tools = [
        "get_image_audit_summary",
        "list_pages_without_lazy_images",
        "list_pages_with_images_missing_dimensions",
        "list_site_image_urls",
        "list_lighthouse_image_opportunities",
        "list_largest_images",
        "list_unoptimized_images",
        "list_images_needing_attention",
    ]
    with patch.object(Ctx, "load_payload", return_value=_payload()), patch.object(Ctx, "load_crawl_df", return_value=df):
        for name in tools:
            result = dispatch_tool(name, {}, context=ctx, conn=conn)
            assert isinstance(result, dict)
            assert "error" not in result
