"""Tests for POST /internal/pipeline/preview — no DB required for these cases
(the non-LLM path never touches the database)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from website_profiling.api.main import app

client = TestClient(app)


def test_preview_with_raw_html_no_url_fetch() -> None:
    html = "<html><body><main><p>Real article content about widgets.</p></main></body></html>"
    resp = client.post("/internal/pipeline/preview", json={"html": html})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "success"
    step_names = [s["name"] for s in body["steps"]]
    assert step_names == [
        "fetch", "strip_boilerplate", "find_main_content", "extract_structured_data", "convert_markdown",
    ]
    assert body["steps"][0]["status"] == "skipped"
    assert "widgets" in body["finalMarkdown"]
    assert body["finalMetrics"]["wordCount"] > 0
    # topKeywords is a real JSON array in the response, not a JSON-encoded
    # string -- avoids the frontend having to double-parse JSON-in-JSON.
    assert isinstance(body["finalMetrics"]["topKeywords"], list)
    assert any(kw["word"] == "widgets" for kw in body["finalMetrics"]["topKeywords"])


def test_preview_applies_main_content_selector_override() -> None:
    html = '<html><body><main>default</main><div id="custom">override</div></body></html>'
    resp = client.post(
        "/internal/pipeline/preview",
        json={"html": html, "mainContentSelectors": "#custom"},
    )
    body = resp.json()
    assert body["status"] == "success"
    find_step = next(s for s in body["steps"] if s["name"] == "find_main_content")
    assert find_step["matchedSelector"] == "#custom"
    assert "override" in body["finalMarkdown"]
    assert "default" not in body["finalMarkdown"]


def test_preview_applies_boilerplate_selector_override() -> None:
    html = """
    <html><body><main>
      <p>Real content.</p>
      <div class="cookie">Default-list noise (not stripped when overridden).</div>
      <div class="custom-noise">Override-only noise.</div>
    </main></body></html>
    """
    resp = client.post(
        "/internal/pipeline/preview",
        json={"html": html, "boilerplateSelectors": ".custom-noise"},
    )
    body = resp.json()
    assert "Override-only noise" not in body["finalMarkdown"]
    assert "Default-list noise" in body["finalMarkdown"]


def test_preview_requires_url_or_html() -> None:
    resp = client.post("/internal/pipeline/preview", json={})
    assert resp.status_code == 400


def test_preview_handles_fetch_failure_gracefully(monkeypatch) -> None:
    from website_profiling.crawl.fetchers.base import FetchResult
    from website_profiling.crawl.fetchers.static import StaticFetcher

    def fake_fetch(self, url):
        return FetchResult(
            status=None, content_type=None, text=None, response_time_ms=None,
            content_length=None, final_url=None, headers_dict={}, redirect_chain_length=0,
        )

    monkeypatch.setattr(StaticFetcher, "fetch", fake_fetch)
    resp = client.post("/internal/pipeline/preview", json={"url": "https://example.invalid/unreachable"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "error"
    assert body["steps"][0]["status"] == "error"


def test_preview_custom_extractors_css_type_no_llm_no_db() -> None:
    html = '<html><body><main><span class="price">$19.99</span></main></body></html>'
    resp = client.post(
        "/internal/pipeline/preview",
        json={"html": html, "customExtractors": [{"name": "price", "type": "css", "selector": ".price"}]},
    )
    body = resp.json()
    assert body["status"] == "success"
    extract_step = next(s for s in body["steps"] if s["name"] == "extract_structured_data")
    assert extract_step["status"] == "success"
    assert extract_step["output"]["price"] == "$19.99"


def test_preview_skips_extraction_step_when_no_extractors_given() -> None:
    html = "<html><body><main>Just content.</main></body></html>"
    resp = client.post("/internal/pipeline/preview", json={"html": html})
    body = resp.json()
    extract_step = next(s for s in body["steps"] if s["name"] == "extract_structured_data")
    assert extract_step["status"] == "skipped"


def test_preview_full_body_strategy_has_no_matched_selector() -> None:
    html = "<html><body><main>Content</main></body></html>"
    resp = client.post(
        "/internal/pipeline/preview",
        json={"html": html, "contentAnalysisStrategy": "full_body"},
    )
    body = resp.json()
    find_step = next(s for s in body["steps"] if s["name"] == "find_main_content")
    assert find_step["matchedSelector"] is None
