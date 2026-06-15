"""Tests for CrUX fetch helpers."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from website_profiling.integrations.crux.fetch import fetch_crux_origin_metrics


def test_fetch_crux_non_numeric_p75_does_not_raise() -> None:
    payload = {
        "record": {
            "metrics": {
                "largest_contentful_paint": {"percentiles": {"p75": "n/a"}, "histogram": []},
                "interaction_to_next_paint": {"percentiles": {"p75": None}, "histogram": []},
                "cumulative_layout_shift": {"percentiles": {"p75": "bad"}, "histogram": []},
            }
        }
    }
    body = json.dumps(payload).encode("utf-8")
    mock_resp = MagicMock()
    mock_resp.read.return_value = body
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = False

    with patch("website_profiling.integrations.crux.fetch.urlopen", return_value=mock_resp):
        out = fetch_crux_origin_metrics("https://example.com", api_key="test-key")

    assert out["ok"] is True
    assert out["pass"] == {"lcp": False, "inp": False, "cls": False}
