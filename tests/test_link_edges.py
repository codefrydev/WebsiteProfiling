"""Tests for rich link edge parsing and export fields."""
from __future__ import annotations

from website_profiling.common import parse_link_edges, parse_links
from website_profiling.reporting.link_edges_report import build_inlink_anchor_matrix


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


def test_parse_link_edges_position_defaults_to_content():
    html = '<html><body><main><a href="/page">Page</a></main></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "content"


def test_parse_link_edges_position_nav_element():
    html = '<html><body><nav><a href="/menu">Menu</a></nav></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "nav"


def test_parse_link_edges_position_footer_element():
    html = '<html><body><footer><a href="/terms">Terms</a></footer></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "footer"


def test_parse_link_edges_position_header_element():
    html = '<html><body><header><a href="/home">Home</a></header></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "header"


def test_parse_link_edges_position_aside_element():
    html = '<html><body><aside><a href="/ads">Ads</a></aside></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "sidebar"


def test_parse_link_edges_position_aria_role_navigation():
    html = '<html><body><div role="navigation"><a href="/nav">Nav</a></div></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "nav"


def test_parse_link_edges_position_aria_role_contentinfo():
    html = '<html><body><div role="contentinfo"><a href="/footer">Footer</a></div></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "footer"


def test_parse_link_edges_position_class_heuristic_sidebar():
    html = '<html><body><div class="sidebar"><a href="/widget">Widget</a></div></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "sidebar"


def test_parse_link_edges_position_id_heuristic_footer():
    html = '<html><body><div id="footer"><a href="/contact">Contact</a></div></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "footer"


def test_parse_link_edges_position_semantic_beats_class():
    """<nav> ancestor takes priority over a parent div with .content class."""
    html = '<html><body><div class="content"><nav><a href="/a">A</a></nav></div></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "nav"


def test_build_inlink_anchor_matrix_includes_top_position():
    edges = [
        {"from_url": "https://ex.com/a", "to_url": "https://ex.com/b",
         "anchor_text": "B", "link_type": "internal", "position": "nav"},
        {"from_url": "https://ex.com/c", "to_url": "https://ex.com/b",
         "anchor_text": "B", "link_type": "internal", "position": "nav"},
        {"from_url": "https://ex.com/d", "to_url": "https://ex.com/b",
         "anchor_text": "B", "link_type": "internal", "position": "content"},
    ]
    rows = build_inlink_anchor_matrix(edges)
    assert len(rows) == 1
    assert rows[0]["inlink_count"] == 3
    assert rows[0]["top_position"] == "nav"  # nav appears 2x vs content 1x


def test_parse_link_edges_position_aria_role_banner():
    html = '<html><body><div role="banner"><a href="/logo">Logo</a></div></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "header"


def test_parse_link_edges_position_aria_role_complementary():
    html = '<html><body><div role="complementary"><a href="/widget">Widget</a></div></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "sidebar"


def test_parse_link_edges_position_class_heuristic_nav():
    html = '<html><body><div class="nav"><a href="/menu">Menu</a></div></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "nav"


def test_parse_link_edges_position_class_heuristic_header():
    html = '<html><body><div class="site-header"><a href="/home">Home</a></div></body></html>'
    _, edges = parse_link_edges("https://example.com/", html)
    assert edges[0]["position"] == "header"


def test_classify_position_skips_none_name_parent():
    """Parents whose .name is None (NavigableString-like nodes) are skipped."""
    from website_profiling.parsing.links import _classify_position

    class _NoNameParent:
        name = None

        def get(self, *_):  # pragma: no cover
            return None

    class _MockTag:
        @property
        def parents(self):
            yield _NoNameParent()

    assert _classify_position(_MockTag()) == "content"


def test_parse_links_backward_compat():
    html = '<html><body><a href="/a">A</a><a href="/b">B</a></body></html>'
    title, links = parse_links("https://example.com", html)
    assert title == ""
    assert links == {"https://example.com/a", "https://example.com/b"}
