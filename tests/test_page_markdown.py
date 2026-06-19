"""Tests for html_to_markdown and extract_page_markdown."""
from __future__ import annotations

import pytest


SIMPLE_HTML = """<html><head><title>Test Page</title></head>
<body>
  <main>
    <h1>Main heading</h1>
    <p>Hello <strong>world</strong>.</p>
    <ul><li>Item one</li><li>Item two</li></ul>
    <a href="https://example.com">Link text</a>
  </main>
</body></html>"""

EMPTY_HTML = "<html><body></body></html>"

NOISY_HTML = """<html><head><title>Noisy</title></head>
<body>
  <nav>Skip nav</nav>
  <script>alert('evil')</script>
  <main><p>Clean content here.</p></main>
  <footer>Footer</footer>
</body></html>"""


def test_html_to_markdown_headings():
    from website_profiling.page_markdown.html_to_markdown import html_to_markdown
    from bs4 import BeautifulSoup

    soup = BeautifulSoup("<h1>Hello</h1><h2>World</h2>", "lxml")
    md = html_to_markdown(soup)
    assert "Hello" in md
    assert "World" in md
    # ATX headings
    assert "#" in md


def test_html_to_markdown_lists():
    from website_profiling.page_markdown.html_to_markdown import html_to_markdown
    from bs4 import BeautifulSoup

    soup = BeautifulSoup("<ul><li>Alpha</li><li>Beta</li></ul>", "lxml")
    md = html_to_markdown(soup)
    assert "Alpha" in md
    assert "Beta" in md
    assert "-" in md


def test_html_to_markdown_strips_scripts():
    from website_profiling.page_markdown.html_to_markdown import html_to_markdown
    from bs4 import BeautifulSoup

    soup = BeautifulSoup("<p>Good</p><script>bad()</script>", "lxml")
    md = html_to_markdown(soup)
    assert "Good" in md
    assert "bad()" not in md


def test_html_to_markdown_none():
    from website_profiling.page_markdown.html_to_markdown import html_to_markdown

    assert html_to_markdown(None) == ""


def test_html_to_markdown_empty():
    from website_profiling.page_markdown.html_to_markdown import html_to_markdown
    from bs4 import BeautifulSoup

    soup = BeautifulSoup("", "lxml")
    md = html_to_markdown(soup)
    assert md == ""


def test_extract_page_markdown_basic():
    from website_profiling.page_markdown.page import extract_page_markdown

    result = extract_page_markdown(SIMPLE_HTML)
    assert result["title"] == "Test Page"
    assert "Main heading" in result["markdown"]
    assert result["word_count"] > 0
    assert result["strategy"] == "main_only"
    assert result["source_byte_length"] == len(SIMPLE_HTML.encode("utf-8"))


def test_extract_page_markdown_full_body_strategy():
    from website_profiling.page_markdown.page import extract_page_markdown

    result = extract_page_markdown(SIMPLE_HTML, strategy="full_body")
    assert result["strategy"] == "full_body"
    assert result["word_count"] > 0


def test_extract_page_markdown_strips_noise():
    from website_profiling.page_markdown.page import extract_page_markdown

    result = extract_page_markdown(NOISY_HTML)
    assert "Clean content here." in result["markdown"]
    assert "evil" not in result["markdown"]


def test_extract_page_markdown_empty_html():
    from website_profiling.page_markdown.page import extract_page_markdown

    result = extract_page_markdown(EMPTY_HTML)
    assert result["markdown"] == "" or isinstance(result["markdown"], str)
    assert result["title"] is None
    assert result["word_count"] == 0


def test_extract_page_markdown_title_fallback_to_h1():
    from website_profiling.page_markdown.page import extract_page_markdown

    html = "<html><body><h1>Fallback H1</h1><p>Content.</p></body></html>"
    result = extract_page_markdown(html)
    assert result["title"] == "Fallback H1"
