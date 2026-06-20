"""
Google Ads Keyword Planner integration.

Wraps three KeywordPlanIdeaService / KeywordPlanService endpoints:
  - GenerateKeywordIdeas   → seed expansion + market volume/competition
  - GenerateKeywordHistoricalMetrics → volume/competition for an existing list
  - GenerateKeywordForecastMetrics   → click/impression forecast (v24-safe)

All results carry PLANNER_PROVENANCE so the UI can label them correctly and
never mix them silently with GSC impressions.

Caches idea + historical results in keyword_suggest_cache (TTL-based) to
respect Ads API quotas.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ...db.storage import _parse_json_field, _row_field

logger = logging.getLogger(__name__)

PLANNER_PROVENANCE = "Google Keyword Planner"

# Batch size for GenerateKeywordHistoricalMetrics (API max ~10 000, keep well under)
_HISTORICAL_BATCH = 2000
# Maximum keywords to attach forecasts to (keep API calls cheap)
_FORECAST_MAX = 50


# ── Competition enum mapping ───────────────────────────────────────────────────

_COMPETITION_MAP = {
    0: "UNSPECIFIED",
    1: "UNKNOWN",
    2: "LOW",
    3: "MEDIUM",
    4: "HIGH",
}


def _competition_label(enum_value: int) -> str:
    return _COMPETITION_MAP.get(int(enum_value or 0), "UNKNOWN")


# ── Cache helpers ──────────────────────────────────────────────────────────────

def _planner_cache_key(kind: str, geo: str, lang: str, payload: str) -> str:
    digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
    return f"planner:{kind}:{geo}:{lang}:{digest}"


def _read_planner_cache(
    conn: Connection,
    cache_key: str,
    ttl_days: int = 1,
) -> Any | None:
    try:
        cur = conn.execute(
            "SELECT fetched_at, data FROM keyword_suggest_cache WHERE cache_key = %s",
            (cache_key,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        fetched_raw = row["fetched_at"]
        if hasattr(fetched_raw, "isoformat"):
            fetched_at = fetched_raw if fetched_raw.tzinfo else fetched_raw.replace(tzinfo=timezone.utc)
        else:
            fetched_at = datetime.fromisoformat(str(fetched_raw).replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 86400
        if age_days > ttl_days:
            return None
        return _parse_json_field(_row_field(row, "data"))
    except Exception:
        return None


def _write_planner_cache(conn: Connection, cache_key: str, data: Any) -> None:
    try:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """INSERT INTO keyword_suggest_cache (cache_key, fetched_at, data)
               VALUES (%s, %s, %s)
               ON CONFLICT (cache_key) DO UPDATE
                 SET fetched_at = EXCLUDED.fetched_at, data = EXCLUDED.data""",
            (cache_key, now, Json(data)),
        )
        conn.commit()
    except Exception:
        pass


# ── Helpers ────────────────────────────────────────────────────────────────────

def _keyword_metrics_to_dict(metrics: Any) -> dict[str, Any]:
    """Convert KeywordHistoricalMetrics proto to plain dict."""
    if metrics is None:
        return {}
    avg = getattr(metrics, "avg_monthly_searches", None)
    comp_enum = getattr(metrics, "competition", None)
    comp_idx = getattr(metrics, "competition_index", None)
    comp_val = int(comp_enum) if comp_enum is not None else 0
    return {
        "planner_avg_monthly_searches": int(avg) if avg is not None else None,
        "planner_competition": _competition_label(comp_val),
        "planner_competition_index": int(comp_idx) if comp_idx is not None else None,
        "planner_provenance": PLANNER_PROVENANCE,
    }


# ── Main API functions ─────────────────────────────────────────────────────────

def generate_keyword_ideas(
    client: Any,
    customer_id: str,
    seeds: list[str],
    lang_id: int = 1000,
    geo_ids: list[int] | None = None,
    *,
    cache_conn: Connection | None = None,
    cache_ttl_days: int = 1,
    page_size: int = 1000,
) -> list[dict[str, Any]]:
    """
    Call GenerateKeywordIdeas to expand seeds into related keywords with
    monthly search volume and competition.

    Returns list of dicts:
      {keyword, planner_avg_monthly_searches, planner_competition,
       planner_competition_index, planner_provenance, sources}
    """
    if not seeds:
        return []

    geo_ids = geo_ids or [2840]  # default: United States
    geo_str = ",".join(str(g) for g in sorted(geo_ids))
    cache_key = _planner_cache_key("ideas", geo_str, str(lang_id), json.dumps(sorted(seeds)))

    if cache_conn is not None:
        cached = _read_planner_cache(cache_conn, cache_key, cache_ttl_days)
        if isinstance(cached, list):
            logger.debug("Planner ideas cache hit: %s seeds", len(seeds))
            return cached

    try:
        service = client.get_service("KeywordPlanIdeaService")
        request = client.get_type("GenerateKeywordIdeasRequest")
        request.customer_id = str(customer_id).replace("-", "")
        request.language = f"languageConstants/{lang_id}"
        for geo_id in geo_ids:
            request.geo_target_constants.append(f"geoTargetConstants/{geo_id}")
        request.include_adult_keywords = False
        request.page_size = page_size
        request.keyword_seed.keywords.extend(seeds)

        results: list[dict[str, Any]] = []
        for idea in service.generate_keyword_ideas(request=request):
            kw = idea.text
            if not kw:
                continue
            m = idea.keyword_idea_metrics
            avg = getattr(m, "avg_monthly_searches", None)
            comp_enum = getattr(m, "competition", None)
            comp_idx = getattr(m, "competition_index", None)
            comp_val = int(comp_enum) if comp_enum is not None else 0
            results.append({
                "keyword": kw.lower(),  # normalize: keywords are case-insensitive
                "planner_avg_monthly_searches": int(avg) if avg is not None else None,
                "planner_competition": _competition_label(comp_val),
                "planner_competition_index": int(comp_idx) if comp_idx is not None else None,
                "planner_provenance": PLANNER_PROVENANCE,
                "sources": ["planner"],
            })

        if cache_conn is not None:
            _write_planner_cache(cache_conn, cache_key, results)
        return results

    except Exception as exc:
        logger.warning("KeywordPlanIdeaService.GenerateKeywordIdeas error: %s", exc)
        return []


def generate_historical_metrics(
    client: Any,
    customer_id: str,
    keywords: list[str],
    lang_id: int = 1000,
    geo_ids: list[int] | None = None,
    *,
    cache_conn: Connection | None = None,
    cache_ttl_days: int = 1,
) -> dict[str, dict[str, Any]]:
    """
    Call GenerateKeywordHistoricalMetrics for a list of keywords.

    Returns {keyword_text: {planner_avg_monthly_searches, planner_competition,
             planner_competition_index, planner_provenance}}
    Only keywords not already having GSC data should be passed here.
    """
    if not keywords:
        return {}

    geo_ids = geo_ids or [2840]
    geo_str = ",".join(str(g) for g in sorted(geo_ids))
    cache_key = _planner_cache_key("hist", geo_str, str(lang_id), json.dumps(sorted(keywords)))

    if cache_conn is not None:
        cached = _read_planner_cache(cache_conn, cache_key, cache_ttl_days)
        if isinstance(cached, dict):
            logger.debug("Planner historical cache hit: %s keywords", len(keywords))
            return cached

    out: dict[str, dict[str, Any]] = {}
    try:
        service = client.get_service("KeywordPlanIdeaService")
        for chunk_start in range(0, len(keywords), _HISTORICAL_BATCH):
            chunk = keywords[chunk_start : chunk_start + _HISTORICAL_BATCH]
            request = client.get_type("GenerateKeywordHistoricalMetricsRequest")
            request.customer_id = str(customer_id).replace("-", "")
            request.language = f"languageConstants/{lang_id}"
            for geo_id in geo_ids:
                request.geo_target_constants.append(f"geoTargetConstants/{geo_id}")
            request.keywords.extend(chunk)

            response = service.generate_keyword_historical_metrics(request=request)
            for result in response.results:
                kw_text = result.text
                if not kw_text:
                    continue
                # Normalize to lowercase so overlay lookups are case-insensitive
                out[kw_text.lower()] = _keyword_metrics_to_dict(result.keyword_metrics)
    except Exception as exc:
        logger.warning("GenerateKeywordHistoricalMetrics error: %s", exc)

    if cache_conn is not None and out:
        _write_planner_cache(cache_conn, cache_key, out)
    return out


def fetch_keyword_forecast(
    client: Any,
    customer_id: str,
    keywords: list[str],
    *,
    daily_budget_micros: int = 10_000_000,
    lang_id: int = 1000,
    geo_ids: list[int] | None = None,
    forecast_days: int = 30,
) -> dict[str, Any]:
    """
    Call GenerateKeywordForecastMetrics (v24-safe shape) for a set of keywords.

    The API returns *aggregate* campaign-level forecast metrics for all keywords
    together — not individual per-keyword data. Returns a summary dict:
      {planner_forecast_clicks, planner_forecast_impressions,
       planner_forecast_average_cpc_micros, planner_forecast_keyword_count,
       planner_provenance}

    v24 field names used:
      geo_target_constants[], ForecastAdGroup.keywords[]
    Avoids removed fields: keyword_plan_network, max_cpc_bid_micros,
      BiddableKeyword, KeywordForecastMetrics.impressions.
    Requires forecast_period with future dates (omitted → API uses next week).
    """
    if not keywords:
        return {}

    from datetime import date, timedelta

    geo_ids = geo_ids or [2840]
    target = keywords[:_FORECAST_MAX]
    out: dict[str, Any] = {}

    try:
        service = client.get_service("KeywordPlanIdeaService")
        request = client.get_type("GenerateKeywordForecastMetricsRequest")
        request.customer_id = str(customer_id).replace("-", "")

        # Forecast period: tomorrow → tomorrow + forecast_days
        tomorrow = date.today() + timedelta(days=1)
        end_date = tomorrow + timedelta(days=max(1, forecast_days))
        request.forecast_period.start_date = tomorrow.strftime("%Y-%m-%d")
        request.forecast_period.end_date = end_date.strftime("%Y-%m-%d")

        campaign = request.campaign
        campaign.bidding_strategy.manual_cpc.enhanced_cpc_enabled = False
        campaign.budget_micros = daily_budget_micros
        # v24: geo_target_constants (replaced geo_modifiers)
        for geo_id in geo_ids:
            campaign.geo_target_constants.append(f"geoTargetConstants/{geo_id}")
        campaign.language = f"languageConstants/{lang_id}"

        # v24: ForecastAdGroup.keywords (replaced biddable_keywords + BiddableKeyword)
        ad_group = campaign.ad_groups.add()
        for kw_text in target:
            kw = ad_group.keywords.add()
            kw.text = kw_text
            kw.match_type = client.enums.KeywordMatchTypeEnum.BROAD

        response = service.generate_keyword_forecast_metrics(request=request)
        # Response is campaign-level aggregate, not per-keyword
        m = getattr(response, "campaign_forecast_metrics", None)
        if m is not None:
            out = {
                "planner_forecast_clicks": float(getattr(m, "clicks", None) or 0),
                "planner_forecast_impressions": float(getattr(m, "impressions", None) or 0),
                "planner_forecast_average_cpc_micros": int(getattr(m, "average_cpc_micros", None) or 0),
                "planner_forecast_keyword_count": len(target),
                "planner_forecast_period_days": forecast_days,
                "planner_provenance": PLANNER_PROVENANCE,
            }
    except Exception as exc:
        logger.warning("GenerateKeywordForecastMetrics error: %s", exc)

    return out
