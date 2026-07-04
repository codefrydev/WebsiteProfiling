"""Tests for content_analysis package."""
from __future__ import annotations

import json

from website_profiling.content_analysis.dom_cleanup import cleanup_dom
from website_profiling.content_analysis.html_loader import load_soup
from website_profiling.content_analysis.main_content import find_main_content
from website_profiling.content_analysis.page import analyze_page_html
from website_profiling.content_analysis.tokenize import tokenize_words


def test_analyze_page_html_counts_body_words() -> None:
    html = "<html><body><main><p>Hello world again.</p></main><nav>Menu Home About</nav></body></html>"
    out = analyze_page_html(html, strategy="main_only")
    assert out["word_count"] > 0
    assert out["reading_level"] >= 0
    assert json.loads(out["top_keywords"])


def test_main_only_excludes_sidebar_noise() -> None:
    html = """
    <html><body>
      <div class="promo-teaser">Extra unrelated promotional text with many filler words here today.</div>
      <main><p>Article about widgets and reviews for buyers.</p></main>
    </body></html>
    """
    main_only = analyze_page_html(html, strategy="main_only")
    full_body = analyze_page_html(html, strategy="full_body")
    assert main_only["word_count"] < full_body["word_count"]


def test_cleanup_dom_removes_scripts() -> None:
    soup = load_soup("<html><body><p>Visible</p><script>var x=1</script></body></html>")
    cleaned = cleanup_dom(soup)
    assert "Visible" in cleaned.get_text()
    assert cleaned.find("script") is None


def test_cleanup_dom_removes_nested_cookie_and_social_widgets() -> None:
    html = """
    <html><body>
      <main>
        <p>Real article text about widgets and reviews.</p>
        <div class="cookie">We use cookies, accept to continue.</div>
        <div class="ad">Buy now special offer today.</div>
        <div class="social-links">Share on Facebook Twitter LinkedIn.</div>
        <div class="breadcrumbs">Home &gt; Category &gt; Article</div>
      </main>
    </body></html>
    """
    soup = load_soup(html)
    cleaned = cleanup_dom(soup)
    text = cleaned.get_text()
    assert "Real article text" in text
    assert "cookies" not in text
    assert "special offer" not in text
    assert "Facebook" not in text
    assert "Category" not in text


def test_cleanup_dom_removes_mediawiki_language_portlet() -> None:
    html = """
    <html><body>
      <main>
        <p>Real article text about web scraping techniques.</p>
        <div id="p-lang-btn" class="vector-dropdown mw-portlet mw-portlet-lang">
          <ul class="vector-menu-content-list">
            <li class="interlanguage-link interwiki-ar"><a href="https://ar.wikipedia.org/x">العربية</a></li>
          </ul>
        </div>
      </main>
    </body></html>
    """
    soup = load_soup(html)
    cleaned = cleanup_dom(soup)
    text = cleaned.get_text()
    assert "Real article text" in text
    assert "العربية" not in text


def test_cleanup_dom_protects_content_root_matching_exclude_selector() -> None:
    soup = load_soup(
        '<html><body><aside id="content"><p>Real article body text.</p></aside></body></html>'
    )
    cleaned = cleanup_dom(soup)
    assert "Real article body text" in cleaned.get_text()
    assert cleaned.find(id="content") is not None


def test_cleanup_dom_still_removes_unprotected_sibling_matching_same_selector() -> None:
    html = """
    <html><body>
      <aside id="content"><p>Real article body text.</p></aside>
      <aside class="other">Unrelated aside noise.</aside>
    </body></html>
    """
    soup = load_soup(html)
    cleaned = cleanup_dom(soup)
    text = cleaned.get_text()
    assert "Real article body text" in text
    assert "Unrelated aside noise" not in text


def test_excerpt_truncation() -> None:
    words = " ".join(f"word{i}" for i in range(80))
    html = f"<html><body><main><p>{words}</p></main></body></html>"
    out = analyze_page_html(html, excerpt_max_chars=40, strategy="main_only")
    assert out["content_excerpt"]
    assert len(out["content_excerpt"]) <= 40


def test_find_main_content_prefers_main_tag() -> None:
    soup = load_soup("<html><body><div>noise</div><main>Primary copy here</main></body></html>")
    root = find_main_content(cleanup_dom(soup), strategy="main_only")
    text = root.get_text(strip=True)
    assert "Primary" in text
    assert "noise" not in text


def test_find_main_content_with_custom_selectors_overrides_default() -> None:
    soup = load_soup(
        '<html><body><main>default winner</main><div id="custom-root">override winner</div></body></html>'
    )
    root = find_main_content(soup, strategy="main_only", selectors="#custom-root")
    assert "override winner" in root.get_text()
    assert "default winner" not in root.get_text()


def test_find_main_content_skips_empty_segments_in_selector_list() -> None:
    soup = load_soup("<html><body><main>Primary copy here</main></body></html>")
    # A leading/double comma produces an empty segment *before* the real
    # candidate is reached -- must be skipped (not passed to select_one())
    # rather than short-circuiting the loop.
    root = find_main_content(soup, strategy="main_only", selectors=" , main")
    assert "Primary copy here" in root.get_text()


def test_find_main_content_falls_back_to_defaults_when_no_override_given() -> None:
    soup = load_soup("<html><body><div>noise</div><main>Primary copy here</main></body></html>")
    root = find_main_content(soup, strategy="main_only")
    assert "Primary" in root.get_text()


def test_cleanup_dom_with_custom_boilerplate_selectors_overrides_default() -> None:
    html = """
    <html><body>
      <main>
        <p>Real article text.</p>
        <div class="cookie">Default-list noise that would normally be stripped.</div>
        <div class="custom-noise">Override-only noise that only the custom list strips.</div>
      </main>
    </body></html>
    """
    soup = load_soup(html)
    cleaned = cleanup_dom(soup, boilerplate_selectors=".custom-noise")
    text = cleaned.get_text()
    assert "Real article text" in text
    assert "Override-only noise" not in text
    # The override REPLACES the default list, so the default-list-only class
    # is no longer stripped -- this documents override semantics precisely.
    assert "Default-list noise" in text


def test_cleanup_dom_falls_back_to_defaults_when_no_override_given() -> None:
    soup = load_soup('<html><body><p>Keep</p><div class="cookie">Strip me</div></body></html>')
    cleaned = cleanup_dom(soup)
    text = cleaned.get_text()
    assert "Keep" in text
    assert "Strip me" not in text


def test_tokenize_words_min_length() -> None:
    tokens = tokenize_words("I am ok testing")
    assert "I" not in tokens
    assert "am" in tokens


def test_tokenize_words_keeps_non_ascii_letters() -> None:
    # Regression: [a-zA-Z]+ dropped accented/non-Latin letters (café -> "caf").
    tokens = tokenize_words("La café est très bon München 日本語")
    assert "café" in tokens
    assert "très" in tokens
    assert "München" in tokens
    assert "日本語" in tokens
    # digits are still excluded (unchanged from the letters-only behaviour)
    assert tokenize_words("abc123 456") == ["abc"]
