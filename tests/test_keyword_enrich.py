"""Tests for keyword enrichment math helpers."""
from __future__ import annotations

import pytest
from website_profiling.integrations.google.keyword_enrich import (
    CTR_CURVE,
    ctr_as_fraction,
    industry_ctr,
    opportunity_clicks,
)


def test_ctr_as_fraction_percent_values() -> None:
    assert ctr_as_fraction(2.8) == pytest.approx(0.028)
    assert ctr_as_fraction(100) == 1.0
    assert ctr_as_fraction(0.5) == 0.005


def test_ctr_as_fraction_clamps_above_100_percent() -> None:
    assert ctr_as_fraction(150) == 1.0


def test_opportunity_clicks_uses_ceil_for_position_slot() -> None:
    # Position 4.1 -> slot 5 (conservative), not slot 4 from round().
    clicks = opportunity_clicks(1000, 4.1, target_pos=3)
    assert clicks == int(1000 * (CTR_CURVE[3] - CTR_CURVE[5]))


def test_opportunity_clicks_boundary_position_three() -> None:
    assert opportunity_clicks(1000, 3.0, target_pos=3) == 0


def test_industry_ctr_uses_ceil() -> None:
    assert industry_ctr(2.1) == CTR_CURVE[3]
    assert industry_ctr(3.0) == CTR_CURVE[3]
