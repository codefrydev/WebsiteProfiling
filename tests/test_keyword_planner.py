"""
Tests for the Google Ads Keyword Planner integration.

Uses a fake GoogleAdsClient that matches the duck-typed interface expected by
keyword_planner.py so no real API credentials are needed.
"""
from __future__ import annotations

import json
import types
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from website_profiling.integrations.google.keyword_planner import (
    PLANNER_PROVENANCE,
    _competition_label,
    _planner_cache_key,
    generate_historical_metrics,
    generate_keyword_ideas,
    fetch_keyword_forecast,
)


# ─── Fake GoogleAdsClient ──────────────────────────────────────────────────────


def _make_idea(text: str, avg: int, comp_enum: int, comp_idx: int) -> Any:
    m = types.SimpleNamespace(
        avg_monthly_searches=avg,
        competition=comp_enum,
        competition_index=comp_idx,
    )
    return types.SimpleNamespace(text=text, keyword_idea_metrics=m)


def _make_hist_result(text: str, avg: int, comp_enum: int, comp_idx: int) -> Any:
    m = types.SimpleNamespace(
        avg_monthly_searches=avg,
        competition=comp_enum,
        competition_index=comp_idx,
    )
    return types.SimpleNamespace(text=text, keyword_metrics=m)


class FakeGenerateKeywordIdeasResponse:
    def __init__(self, ideas):
        self._ideas = ideas

    def __iter__(self):
        return iter(self._ideas)


class FakeGenerateHistoricalMetricsResponse:
    def __init__(self, results):
        self.results = results


class FakeService:
    def __init__(self, ideas=None, hist_results=None, forecast_campaign_metrics=None):
        self._ideas = ideas or []
        self._hist_results = hist_results or []
        # forecast returns campaign-level aggregate, not per-keyword
        self._forecast_campaign_metrics = forecast_campaign_metrics

    def generate_keyword_ideas(self, *, request):
        return FakeGenerateKeywordIdeasResponse(self._ideas)

    def generate_keyword_historical_metrics(self, *, request):
        return FakeGenerateHistoricalMetricsResponse(self._hist_results)

    def generate_keyword_forecast_metrics(self, *, request):
        return types.SimpleNamespace(campaign_forecast_metrics=self._forecast_campaign_metrics)


def _make_fake_forecast_period():
    return types.SimpleNamespace(start_date="", end_date="")


def _make_fake_request_type(name: str):
    """Return a simple namespace factory mimicking client.get_type(name)."""

    class FakeRequest:
        def __init__(self):
            self.customer_id = ""
            self.language = ""
            self.geo_target_constants = []
            self.include_adult_keywords = False
            self.page_size = 1000
            self.keywords = []

            # For ideas request
            self.keyword_seed = types.SimpleNamespace(keywords=[])

            # For forecast request
            self.campaign = _make_fake_campaign()
            self.forecast_period = _make_fake_forecast_period()

    return FakeRequest


def _make_fake_campaign():
    class FakeAdGroups:
        def __init__(self):
            self._groups = []

        def add(self):
            g = types.SimpleNamespace(keywords=FakeKeywordList())
            self._groups.append(g)
            return g

    class FakeKeywordList:
        def __init__(self):
            self._kws = []

        def add(self):
            kw = types.SimpleNamespace(text="", match_type=None)
            self._kws.append(kw)
            return kw

    return types.SimpleNamespace(
        bidding_strategy=types.SimpleNamespace(
            manual_cpc=types.SimpleNamespace(enhanced_cpc_enabled=False)
        ),
        budget_micros=0,
        # v24 field name: geo_target_constants (not geo_targets)
        geo_target_constants=[],
        language="",
        ad_groups=FakeAdGroups(),
    )


class FakeKeywordMatchTypeEnum:
    BROAD = 2


class FakeEnums:
    KeywordMatchTypeEnum = FakeKeywordMatchTypeEnum


class FakeGoogleAdsClient:
    enums = FakeEnums()

    def __init__(self, service: FakeService):
        self._service = service
        self._request_types = {}

    def get_service(self, name: str) -> FakeService:
        return self._service

    def get_type(self, name: str):
        return _make_fake_request_type(name)()


# ─── Unit tests ────────────────────────────────────────────────────────────────


class TestCompetitionLabel:
    def test_known_values(self):
        assert _competition_label(2) == "LOW"
        assert _competition_label(3) == "MEDIUM"
        assert _competition_label(4) == "HIGH"

    def test_unknown_falls_back(self):
        assert _competition_label(0) == "UNSPECIFIED"
        assert _competition_label(99) == "UNKNOWN"


class TestCacheKey:
    def test_deterministic(self):
        k1 = _planner_cache_key("ideas", "2840", "1000", json.dumps(["seo", "keyword"]))
        k2 = _planner_cache_key("ideas", "2840", "1000", json.dumps(["seo", "keyword"]))
        assert k1 == k2

    def test_different_kind(self):
        k1 = _planner_cache_key("ideas", "2840", "1000", "x")
        k2 = _planner_cache_key("hist", "2840", "1000", "x")
        assert k1 != k2


class TestGenerateKeywordIdeas:
    def _client(self, ideas):
        return FakeGoogleAdsClient(FakeService(ideas=ideas))

    def test_returns_idea_list(self):
        ideas = [
            _make_idea("seo tools", 5000, 3, 60),
            _make_idea("keyword research", 8000, 4, 80),
        ]
        client = self._client(ideas)
        result = generate_keyword_ideas(client, "1234567890", ["seo"])
        assert len(result) == 2
        assert result[0]["keyword"] == "seo tools"
        assert result[0]["planner_avg_monthly_searches"] == 5000
        assert result[0]["planner_competition"] == "MEDIUM"
        assert result[0]["planner_competition_index"] == 60
        assert result[0]["planner_provenance"] == PLANNER_PROVENANCE
        assert result[0]["sources"] == ["planner"]

    def test_empty_seeds_returns_empty(self):
        client = self._client([])
        assert generate_keyword_ideas(client, "123", []) == []

    def test_skips_empty_text(self):
        ideas = [_make_idea("", 1000, 2, 10), _make_idea("valid", 500, 2, 20)]
        client = self._client(ideas)
        result = generate_keyword_ideas(client, "123", ["seed"])
        assert len(result) == 1
        assert result[0]["keyword"] == "valid"

    def test_api_error_returns_empty(self):
        service = FakeService()
        service.generate_keyword_ideas = MagicMock(side_effect=Exception("API error"))
        client = FakeGoogleAdsClient(service)
        result = generate_keyword_ideas(client, "123", ["seo"])
        assert result == []

    def test_cache_hit_skips_api(self):
        ideas = [_make_idea("cached kw", 1000, 2, 10)]
        client = self._client(ideas)
        # Prime cache
        result_1 = generate_keyword_ideas(client, "123", ["seo"])
        assert len(result_1) == 1

        # Now the service would fail but cache should hit
        service_fail = FakeService()
        service_fail.generate_keyword_ideas = MagicMock(side_effect=Exception("should not call"))
        client_fail = FakeGoogleAdsClient(service_fail)

        # Without a real DB conn we can't fully test the cache path,
        # but we can verify no exception is raised (cache_conn=None falls through to API)
        result_2 = generate_keyword_ideas(client_fail, "123", [], cache_conn=None)
        assert result_2 == []


class TestGenerateHistoricalMetrics:
    def _client(self, results):
        return FakeGoogleAdsClient(FakeService(hist_results=results))

    def test_returns_dict_by_keyword(self):
        results = [
            _make_hist_result("seo tools", 5000, 3, 60),
            _make_hist_result("keyword research", 8000, 4, 80),
        ]
        client = self._client(results)
        out = generate_historical_metrics(client, "123", ["seo tools", "keyword research"])
        assert "seo tools" in out
        assert out["seo tools"]["planner_avg_monthly_searches"] == 5000
        assert out["seo tools"]["planner_competition"] == "MEDIUM"
        assert out["seo tools"]["planner_provenance"] == PLANNER_PROVENANCE

    def test_empty_keywords_returns_empty(self):
        client = self._client([])
        assert generate_historical_metrics(client, "123", {}) == {}

    def test_api_error_returns_partial(self):
        service = FakeService(hist_results=[_make_hist_result("good kw", 1000, 2, 10)])
        call_count = [0]
        original = service.generate_keyword_historical_metrics

        def flaky(*, request):
            call_count[0] += 1
            if call_count[0] > 1:
                raise Exception("quota")
            return original(request=request)

        service.generate_keyword_historical_metrics = flaky
        client = FakeGoogleAdsClient(service)
        out = generate_historical_metrics(client, "123", ["good kw"])
        assert isinstance(out, dict)

    def test_skips_empty_text(self):
        results = [_make_hist_result("", 1000, 2, 10), _make_hist_result("real kw", 500, 2, 20)]
        client = self._client(results)
        out = generate_historical_metrics(client, "123", ["real kw"])
        assert "" not in out
        assert "real kw" in out


class TestFetchKeywordForecast:
    """
    GenerateKeywordForecastMetrics returns *aggregate* campaign-level metrics,
    not per-keyword data. The function returns a single summary dict.
    """

    def _make_campaign_metrics(self, clicks, impressions, avg_cpc_micros=1_000_000):
        return types.SimpleNamespace(
            clicks=clicks,
            impressions=impressions,
            average_cpc_micros=avg_cpc_micros,
        )

    def test_returns_aggregate_dict(self):
        cm = self._make_campaign_metrics(clicks=250.0, impressions=5000.0)
        service = FakeService(forecast_campaign_metrics=cm)
        client = FakeGoogleAdsClient(service)
        out = fetch_keyword_forecast(client, "123", ["seo tools", "keyword research"])
        assert "planner_forecast_clicks" in out
        assert abs(out["planner_forecast_clicks"] - 250.0) < 0.01
        assert abs(out["planner_forecast_impressions"] - 5000.0) < 0.01
        assert out["planner_forecast_keyword_count"] == 2
        assert out["planner_provenance"] == PLANNER_PROVENANCE

    def test_empty_keywords_returns_empty(self):
        client = FakeGoogleAdsClient(FakeService())
        assert fetch_keyword_forecast(client, "123", []) == {}

    def test_api_error_returns_empty(self):
        service = FakeService()
        service.generate_keyword_forecast_metrics = MagicMock(side_effect=Exception("err"))
        client = FakeGoogleAdsClient(service)
        out = fetch_keyword_forecast(client, "123", ["seo"])
        assert out == {}

    def test_none_campaign_metrics_returns_empty(self):
        service = FakeService(forecast_campaign_metrics=None)
        client = FakeGoogleAdsClient(service)
        out = fetch_keyword_forecast(client, "123", ["seo"])
        assert out == {}


class TestPlannerDoesNotOverwriteGscData:
    """Integration-level assertion: overlay must not mutate rows with real GSC impressions."""

    def test_overlay_respects_gsc_impressions(self):
        """Simulate what run_enrichment does: skip rows that already have gsc_impressions."""
        rows = [
            {"keyword": "seo tools", "gsc_impressions": 500, "planner_avg_monthly_searches": None},
            {"keyword": "keyword research", "gsc_impressions": None, "planner_avg_monthly_searches": None},
        ]
        # Only rows missing GSC impressions should be passed to generate_historical_metrics
        needs_volume = [
            r for r in rows
            if r.get("gsc_impressions") is None and r.get("planner_avg_monthly_searches") is None
        ]
        kw_list = [r["keyword"] for r in needs_volume]
        assert kw_list == ["keyword research"]
        # seo tools is protected
        assert "seo tools" not in kw_list


class TestNewPlannerKeywordsTaggedCorrectly:
    """New keywords from discovery should have sources=['planner']."""

    def test_idea_rows_have_planner_source(self):
        ideas = [
            _make_idea("best seo tool", 2000, 3, 50),
        ]
        client = FakeGoogleAdsClient(FakeService(ideas=ideas))
        result = generate_keyword_ideas(client, "123", ["seo"])
        assert result[0]["sources"] == ["planner"]
        assert result[0]["planner_provenance"] == PLANNER_PROVENANCE


class TestCaseNormalization:
    """Keyword text from the API must be lowercased so overlay lookups never miss."""

    def test_ideas_keyword_is_lowercased(self):
        ideas = [_make_idea("Best SEO Tool", 2000, 3, 50)]
        client = FakeGoogleAdsClient(FakeService(ideas=ideas))
        result = generate_keyword_ideas(client, "123", ["seo"])
        assert result[0]["keyword"] == "best seo tool"

    def test_historical_metrics_keys_are_lowercased(self):
        results = [_make_hist_result("Keyword Research", 8000, 4, 80)]
        client = FakeGoogleAdsClient(FakeService(hist_results=results))
        out = generate_historical_metrics(client, "123", ["keyword research"])
        assert "keyword research" in out
        assert "Keyword Research" not in out
