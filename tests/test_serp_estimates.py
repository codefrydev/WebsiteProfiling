"""Tests for SERP competition estimates."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from website_profiling.integrations.serp.estimates import fetch_serp_features


def test_standard_serp_competition_normalized_to_72() -> None:
    payload = {
        "organic_results": [{}] * 10,
        "answer_box": {"snippet": "x"},
    }
    body = json.dumps(payload).encode("utf-8")
    mock_resp = MagicMock()
    mock_resp.read.return_value = body
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = False

    with patch("website_profiling.integrations.serp.estimates.urllib.request.urlopen", return_value=mock_resp):
        out = fetch_serp_features("seo tools", "key")

    assert out["ok"] is True
    assert out["estimated_competition"] == 72
    assert out["provenance"] == "Estimated (heuristic-v1)"
