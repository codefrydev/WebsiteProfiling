"""Shared score rounding helpers."""
from __future__ import annotations

import math


def round_half_up(value: float) -> int:
    """Round to nearest integer, halves away from zero (not banker's rounding)."""
    return math.floor(value + 0.5)
