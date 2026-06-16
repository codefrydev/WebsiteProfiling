"""Regression tests for keyword intent classification.

`classify_intent` must not raise when the brand name is empty or whitespace-only.
"""
from __future__ import annotations

import pytest

from website_profiling.integrations.google.keyword_enrich import classify_intent

_VALID = {"navigational", "informational", "transactional", "commercial"}


@pytest.mark.parametrize("brand", ["", "   ", "\t\n"])
def test_blank_or_whitespace_brand_does_not_raise(brand: str) -> None:
    # Whitespace-only brand is truthy but splits to [], which used to IndexError.
    assert classify_intent("some search query", brand_name=brand) in _VALID


def test_brand_token_match_is_navigational() -> None:
    assert classify_intent("acme login", brand_name="Acme") == "navigational"


def test_no_brand_falls_through_to_other_intents() -> None:
    assert classify_intent("how to bake bread") == "informational"
