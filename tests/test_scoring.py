"""Tests for scoring helpers."""
from __future__ import annotations

from website_profiling.scoring import round_half_up


def test_round_half_up_away_from_bankers_rounding() -> None:
    assert round_half_up(49.5) == 50
    assert round_half_up(50.5) == 51
