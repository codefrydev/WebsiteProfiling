import json


def test_normalize_link_filters_schemes_and_strips_fragment_and_slash() -> None:
    from website_profiling.common import normalize_link

    assert normalize_link("https://x.com", "mailto:test@example.com") is None
    assert normalize_link("https://x.com", "javascript:alert(1)") is None
    assert normalize_link("https://x.com", "ftp://x.com/a") is None

    assert normalize_link("https://x.com/base/", "/a#frag") == "https://x.com/a"
    assert normalize_link("https://x.com/base/", "https://x.com/a/") == "https://x.com/a"


def test_parse_links_and_title() -> None:
    from website_profiling.common import parse_links

    html = """
    <html><head><title> Hello </title></head>
    <body>
      <a href="/a">A</a>
      <a href="mailto:test@example.com">Mail</a>
      <a href="https://ext.com/x">X</a>
    </body></html>
    """
    title, links = parse_links("https://site.com", html)
    assert title == "Hello"
    assert "https://site.com/a" in links
    assert "https://ext.com/x" in links


def test_parse_seo_and_extended_flags() -> None:
    from website_profiling.common import parse_seo, parse_seo_extended

    html = """
    <html><head>
      <meta name="description" content="Desc">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="robots" content="noindex,follow">
      <link rel="canonical" href="/canon/">
      <script type="application/ld+json">{}</script>
    </head>
    <body>
      <h1>H1</h1>
      <img src="http://mixed.com/a.png">
      <img src="/b.png" loading="lazy" width="10" height="10" alt="x">
      <div aria-label="x"></div>
    </body></html>
    """
    meta_desc, meta_len, h1_text, h1_count, canon = parse_seo("https://s.com", html)
    assert meta_desc == "Desc"
    assert meta_len == 4
    assert h1_text == "H1"
    assert h1_count == 1
    assert canon == "https://s.com/canon"

    ext = parse_seo_extended(html, "https://s.com")
    assert ext["viewport_present"] is True
    assert ext["noindex"] is True
    assert ext["has_schema"] is True
    assert ext["images_total"] == 2
    assert ext["images_without_alt"] == 1
    assert ext["mixed_content_count"] > 0

    json.dumps(ext)


def test_parse_links_serialized_and_empty_detection() -> None:
    from website_profiling.common import _is_empty, parse_links_serialized

    assert _is_empty(None) is True
    assert _is_empty("") is True
    assert _is_empty([]) is False
    assert _is_empty(["x"]) is False

    assert parse_links_serialized('["a","b"]') == ["a", "b"]
    assert parse_links_serialized("") == []
    assert parse_links_serialized(None) == []

