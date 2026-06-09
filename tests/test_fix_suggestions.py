"""Tests for unified fix suggestion generator."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.llm.fix_suggestions import (
    VALID_SOURCES,
    _build_user_payload,
    _cache_key,
    generate_fix_suggestion,
)

_ENABLED_CFG = {"llm_enabled": True, "llm_enable_issue_fixes": "true", "llm_model": "test-model"}


def test_valid_sources() -> None:
    assert VALID_SOURCES == frozenset(
        {"issue", "lighthouse", "security", "browser", "seo_content", "technical"}
    )


def test_message_required() -> None:
    with patch("website_profiling.llm.fix_suggestions.llm_is_enabled", return_value=True):
        out = generate_fix_suggestion({"source": "lighthouse", "message": "  "}, cfg=_ENABLED_CFG)
    assert out["ok"] is False
    assert "message" in out["error"].lower()


def test_disabled_llm() -> None:
    with patch("website_profiling.llm.fix_suggestions.llm_is_enabled", return_value=False):
        out = generate_fix_suggestion({"message": "Slow LCP"}, cfg=_ENABLED_CFG)
    assert out["ok"] is False
    assert "disabled" in out["error"].lower()


def test_fix_suggestions_disabled_in_settings() -> None:
    cfg = {"llm_enabled": True, "llm_enable_issue_fixes": "false"}
    with patch("website_profiling.llm.fix_suggestions.llm_is_enabled", return_value=True):
        out = generate_fix_suggestion({"message": "Missing HSTS"}, cfg=cfg)
    assert out["ok"] is False
    assert "disabled" in out["error"].lower()


def test_cache_key_varies_by_source() -> None:
    base = {"message": "x", "url": "https://example.com/"}
    k1 = _cache_key("gpt-4o-mini", "lighthouse", {**base, "source": "lighthouse"})
    k2 = _cache_key("gpt-4o-mini", "security", {**base, "source": "security"})
    assert k1 != k2


def test_build_user_payload_legacy_issue_fields() -> None:
    payload = _build_user_payload(
        {
            "source": "issue",
            "message": "Noindex",
            "url": "https://example.com/a",
            "priority": "High",
            "category": "Indexation",
            "recommendation": "Remove noindex",
            "type": "noindex",
        }
    )
    assert payload["source"] == "issue"
    assert payload["context"]["priority"] == "High"
    assert payload["context"]["category"] == "Indexation"


@pytest.mark.parametrize("source", sorted(VALID_SOURCES))
def test_each_source_accepts_minimal_payload(source: str) -> None:
    cached_fix = {"fix": "Do the thing.", "effort": "low"}
    with patch("website_profiling.llm.fix_suggestions.llm_is_enabled", return_value=True):
        with patch("website_profiling.llm.fix_suggestions._read_cache", return_value=cached_fix):
            out = generate_fix_suggestion(
                {"source": source, "message": f"Problem for {source}"},
                cfg=_ENABLED_CFG,
            )
    assert out["ok"] is True
    assert out["cached"] is True
    assert out["fix"]["fix"] == "Do the thing."


def test_llm_call_writes_cache() -> None:
    client = MagicMock()
    client.complete_json.return_value = {"fix": "Add preload.", "effort": "low"}
    with patch("website_profiling.llm.fix_suggestions.llm_is_enabled", return_value=True):
        with patch("website_profiling.llm.fix_suggestions._read_cache", return_value=None):
            with patch("website_profiling.llm.fix_suggestions.get_llm_client", return_value=client):
                with patch("website_profiling.llm.fix_suggestions._write_cache") as write:
                    out = generate_fix_suggestion(
                        {"source": "browser", "message": "TypeError", "context": {"stack": "at foo"}},
                        cfg=_ENABLED_CFG,
                    )
    assert out["ok"] is True
    assert out["fix"]["fix"] == "Add preload."
    write.assert_called_once()
