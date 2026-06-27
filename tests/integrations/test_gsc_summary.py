"""GSC summary aggregation tests."""

from __future__ import annotations


def _weighted_avg_position(pages: list[dict]) -> float:
    total_impr = sum(r["impressions"] for r in pages)
    if not total_impr:
        return 0.0
    return round(
        sum(r["position"] * r["impressions"] for r in pages) / total_impr,
        1,
    )


def test_avg_position_is_impression_weighted() -> None:
    pages = [
        {"position": 1, "impressions": 10},
        {"position": 15, "impressions": 100_000},
    ]
    assert _weighted_avg_position(pages) == 15.0
    unweighted = round(sum(r["position"] for r in pages) / len(pages), 1)
    assert unweighted == 8.0
