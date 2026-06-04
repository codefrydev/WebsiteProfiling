import pandas as pd


def test_load_save_dataframe_and_edges(tmp_path) -> None:
    from website_profiling.common import load_dataframe, load_edges, save_dataframe, save_edges

    df = pd.DataFrame([{"a": 1}, {"a": 2}])
    p = tmp_path / "x.csv"
    save_dataframe(df, str(p))
    df2 = load_dataframe(str(p))
    assert df2.shape[0] == 2

    edges = [("a", "b"), ("b", "c")]
    ep = tmp_path / "edges.csv"
    save_edges(edges, str(ep))
    edges2 = load_edges(str(ep))
    assert edges2 == edges


def test_parse_resources_and_social_meta() -> None:
    from bs4 import BeautifulSoup

    from website_profiling.common import parse_resources, parse_social_meta

    html = """
    <html><head>
      <meta property="og:title" content="T">
      <meta property="og:image" content="/img.png">
      <meta name="twitter:card" content="summary">
      <link rel="stylesheet" href="/a.css">
      <script src="/a.js"></script>
    </head></html>
    """
    soup = BeautifulSoup(html, "lxml")
    social = parse_social_meta(soup)
    assert social["og_title"] == "T"
    assert social["twitter_card"] == "summary"

    res = parse_resources(html, "https://site.com")
    assert res["script_count"] == 1
    assert res["link_stylesheet_count"] == 1


def test_parse_content_text_extracts_keywords_and_excerpt() -> None:
    from bs4 import BeautifulSoup

    from website_profiling.common import parse_content_text

    html = "<html><body><h1>Hello world</h1><p>Hello again. This is a test sentence.</p><script>var x=1</script></body></html>"
    soup = BeautifulSoup(html, "lxml")
    out = parse_content_text(soup, raw_html=html, excerpt_max_chars=30)
    assert out["word_count"] > 0
    assert out["content_excerpt"]
