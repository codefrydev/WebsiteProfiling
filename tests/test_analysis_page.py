import json


def test_analyze_html_basic_counts_and_warnings() -> None:
    from website_profiling.analysis.page import analyze_html

    html = """
    <html lang="en">
      <head>
        <link rel="alternate" hreflang="en" href="/en/" />
        <link rel="alternate" hreflang="es" href="/es/" />
        <script src="https://thirdparty.com/a.js"></script>
        <script>console.log("x")</script>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <a href="/internal">Go</a>
        <a href="https://ext.com/x">X</a>
        <img src="/a.png" />
        <form><input type="text" id="q"></form>
      </body>
    </html>
    """
    out = analyze_html(
        html=html,
        page_url="https://site.com/page",
        base_url="https://site.com/page",
        canonical_url="",
    )
    assert out["internal_link_count"] >= 1
    assert out["external_link_count"] >= 1
    assert out["html_lang"] == "en"
    assert isinstance(out["warnings"], list)
    json.dumps(out)


def test_json_ld_missing_type_detection() -> None:
    from website_profiling.analysis.page import _json_ld_missing_type

    assert _json_ld_missing_type({"@context": "x"}) is False
    assert _json_ld_missing_type({"name": "Acme"}) is True
    assert _json_ld_missing_type({"@graph": [{"@type": "Thing"}, {"name": "X"}]}) is True

