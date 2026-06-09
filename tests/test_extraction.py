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
