"""Tests for LLM JSON parsing."""
from __future__ import annotations

from website_profiling.llm.base import parse_json_response


def test_parse_json_response_plain():
    assert parse_json_response('{"pages": []}') == {"pages": []}


def test_parse_json_response_markdown_fence():
    text = 'Here is JSON:\n{"clusters": [{"top_keyword": "seo"}]}\n'
    out = parse_json_response(text)
    assert "clusters" in out
