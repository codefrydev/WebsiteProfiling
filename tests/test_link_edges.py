"""Tests for rich link edge parsing and export fields."""
from __future__ import annotations

from website_profiling.common import parse_link_edges, parse_links


def test_parse_link_edges_anchor_and_rel():
    html = """
    <html><head><title>Page</title></head><body>
      <a href="/about">About us</a>
      <a href="https://ext.com/x" rel="nofollow sponsored">Partner</a>
    </body></html>
    """
    title, edges = parse_link_edges("https://example.com/", html)
    assert title == "Page"
    assert len(edges) == 2
    internal = next(e for e in edges if e["to_url"].endswith("/about"))
    assert internal["anchor_text"] == "About us"
    assert internal["link_type"] == "internal"
    assert internal["is_nofollow"] is False
    external = next(e for e in edges if "ext.com" in e["to_url"])
    assert external["is_nofollow"] is True
    assert external["is_sponsored"] is True
    assert external["link_type"] == "external"


def test_parse_links_backward_compat():
    html = '<html><body><a href="/a">A</a><a href="/b">B</a></body></html>'
    title, links = parse_links("https://example.com", html)
    assert title == ""
    assert links == {"https://example.com/a", "https://example.com/b"}


def test_workbook_links_csv_columns():
    from website_profiling.tools.export_crawl_workbook import build_crawl_workbook_zip
    import zipfile
    import io

    payload = {
        "link_edges": [
            {
                "from_url": "https://example.com/",
                "to_url": "https://example.com/about",
                "anchor_text": "About",
                "rel": "nofollow",
                "is_nofollow": True,
                "is_sponsored": False,
                "is_ugc": False,
                "link_type": "internal",
            }
        ]
    }
    raw = build_crawl_workbook_zip(payload)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        header = zf.read("links.csv").decode("utf-8").splitlines()[0]
    assert "from_url" in header
    assert "anchor_text" in header
    assert "is_nofollow" in header
