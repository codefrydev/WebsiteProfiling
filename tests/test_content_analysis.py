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
      <div class="sidebar">Extra sidebar noise with many filler words here today.</div>
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


def test_tokenize_words_min_length() -> None:
    tokens = tokenize_words("I am ok testing")
    assert "I" not in tokens
    assert "am" in tokens
