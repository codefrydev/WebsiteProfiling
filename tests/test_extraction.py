"""Tests for custom extractors."""
from __future__ import annotations

from website_profiling.crawl.extraction import parse_extractors_config, run_extractors


def test_run_css_extractor():
    html = '<html><div data-id="42">x</div></html>'
    specs = [{"name": "id", "type": "css", "selector": "[data-id]", "attr": "data-id"}]
    assert run_extractors(html, specs) == {"id": "42"}


def test_parse_extractors_config_json():
    raw = '[{"name":"a","type":"regex","pattern":"(\\\\d+)"}]'
    out = parse_extractors_config(raw)
    assert len(out) == 1 and out[0]["name"] == "a"


def test_run_llm_extractor_uses_injected_resolver():
    html = '<html><body><span class="price">$19.99</span></body></html>'
    specs = [{"name": "price", "type": "llm", "description": "the product price"}]
    resolver = lambda spec, html: {"type": "css", "selector": ".price"}  # noqa: E731
    assert run_extractors(html, specs, llm_resolver=resolver) == {"price": "$19.99"}


def test_run_llm_extractor_without_resolver_skips_silently():
    html = '<html><body><span class="price">$19.99</span></body></html>'
    specs = [{"name": "price", "type": "llm", "description": "the product price"}]
    assert run_extractors(html, specs) == {}


def test_run_llm_extractor_resolver_returning_none_skips_field():
    html = '<html><body><span class="price">$19.99</span></body></html>'
    specs = [{"name": "price", "type": "llm", "description": "the product price"}]
    assert run_extractors(html, specs, llm_resolver=lambda spec, html: None) == {}


def test_run_llm_extractor_resolved_xpath_with_no_match_skips_field():
    html = "<html><body><p>no price here</p></body></html>"
    specs = [{"name": "price", "type": "llm", "description": "the price"}]
    resolver = lambda spec, html: {"type": "xpath", "expr": "//span[@class='price']"}  # noqa: E731
    assert run_extractors(html, specs, llm_resolver=resolver) == {}


def test_run_llm_extractor_resolver_returning_unknown_type_skips_field():
    html = '<html><body><span class="price">$9.99</span></body></html>'
    specs = [{"name": "price", "type": "llm", "description": "the price"}]
    resolver = lambda spec, html: {"type": "regex", "pattern": "x"}  # noqa: E731
    assert run_extractors(html, specs, llm_resolver=resolver) == {}


def test_llm_extractor_does_not_affect_manual_extractors_in_same_call():
    html = '<html><div data-id="42">x</div><span class="price">$19.99</span></html>'
    specs = [
        {"name": "id", "type": "css", "selector": "[data-id]", "attr": "data-id"},
        {"name": "price", "type": "llm", "description": "the product price"},
    ]
    resolver = lambda spec, html: {"type": "css", "selector": ".price"}  # noqa: E731
    out = run_extractors(html, specs, llm_resolver=resolver)
    assert out == {"id": "42", "price": "$19.99"}
