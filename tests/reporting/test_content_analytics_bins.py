"""Content ratio distribution bin contiguity."""

from __future__ import annotations

import pandas as pd

from website_profiling.reporting.content_analytics import _build_content_analytics


def test_content_ratio_distribution_has_no_bin_gaps() -> None:
    df = pd.DataFrame(
        {
            "status": ["200"] * 4,
            "word_count": [100, 200, 300, 400],
            "content_html_ratio": [10.005, 10.0, 19.99, 40.0],
        }
    )

    out = _build_content_analytics(df)
    dist = out["content_ratio_distribution"]

    assert sum(dist.values()) == 4
    assert dist["<10%"] == 0
    assert dist["10-20%"] == 2
    assert dist["20-40%"] == 1
    assert dist[">40%"] == 1
