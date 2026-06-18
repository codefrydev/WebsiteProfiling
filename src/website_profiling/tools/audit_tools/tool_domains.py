"""Explicit tool domain/tier metadata for routing and MCP domain servers."""
from __future__ import annotations

from typing import Any

CANONICAL_DOMAINS: tuple[str, ...] = (
    "core",
    "portfolio",
    "issues",
    "crawl",
    "onpage",
    "schema",
    "links",
    "indexation",
    "content",
    "keywords",
    "google",
    "backlinks",
    "performance",
    "drift",
    "security",
    "ops",
    "export",
    "images",
    "geo",
    "accessibility",
    "assets",
    "ctr",
    "integrations",
    "insight",
)

# Tier 0 — always included in chat dynamic routing (router + top insight tools).
TIER_0_TOOLS: frozenset[str] = frozenset({
    "search_audit_tools",
    "list_tool_domains",
    "get_data_coverage_report",
    "run_insight_workflow",
    "run_technical_workflow",
    "run_keyword_workflow",
    "run_domain_agent",
    "get_report_summary",
    "list_top_impact_issues",
    "prioritize_fix_roadmap",
    "get_landing_page_blended_table",
    "get_opportunity_matrix",
    "get_traffic_health_check",
    "get_landing_page_full_diagnosis",
    "get_issue_to_traffic_map",
    "get_google_summary",
})

# Explicit domain overrides (name -> domain).
_DOMAIN_OVERRIDES: dict[str, str] = {
    "search_audit_tools": "core",
    "list_tool_domains": "core",
    "get_data_coverage_report": "core",
    "run_insight_workflow": "core",
    "run_technical_workflow": "core",
    "run_keyword_workflow": "core",
    "run_domain_agent": "core",
    "get_landing_page_blended_table": "insight",
    "get_opportunity_matrix": "insight",
    "get_traffic_health_check": "insight",
    "get_landing_page_full_diagnosis": "insight",
    "get_issue_to_traffic_map": "insight",
    "get_gsc_daily_trend": "google",
    "get_ga4_daily_trend": "google",
    "get_ga4_by_device": "google",
    "get_ga4_by_channel": "google",
    "get_brand_keyword_split": "keywords",
    "list_keywords_by_intent": "keywords",
    "get_gsc_page_queries": "google",
    "list_broken_links": "links",
    "list_broken_link_sources": "links",
    "get_gsc_sample_links": "backlinks",
    "get_gsc_latest_links": "backlinks",
    "get_gsc_links_summary": "backlinks",
    "get_gsc_links_import_status": "backlinks",
    "list_seo_onpage_issues": "onpage",
    "list_content_url_issues": "onpage",
    "list_pages_missing_title": "onpage",
    "list_pages_missing_h1": "onpage",
    "list_pages_multiple_h1": "onpage",
    "list_pages_missing_meta_description": "onpage",
    "list_pages_meta_desc_too_short": "onpage",
    "list_pages_meta_desc_too_long": "onpage",
    "list_pages_noindex": "onpage",
    "list_pages_missing_canonical": "onpage",
    "list_canonical_mismatch": "onpage",
    "list_pages_with_missing_alt": "onpage",
    "list_pages_skipped_headings": "onpage",
    "list_pages_missing_viewport": "onpage",
    "list_pages_missing_og_image": "onpage",
    "get_report_summary": "portfolio",
    "get_critical_issues": "issues",
    "get_issue_priority_breakdown": "issues",
    "list_top_impact_issues": "issues",
    "prioritize_fix_roadmap": "issues",
    "get_google_summary": "google",
    "get_gsc_ctr_opportunity_pages": "ctr",
    "list_keywords_ctr_opportunity": "ctr",
    "analyze_serp_snippet_for_url": "ctr",
    "compare_reports": "drift",
    "compare_gsc_periods": "google",
    "list_pages_title_too_short": "onpage",
    "list_pages_title_too_long": "onpage",
    "list_pages_slow_response": "performance",
    "list_pages_color_contrast_failures": "accessibility",
    "list_pages_high_reading_level": "content",
    "list_pages_very_thin_content": "content",
    "list_hreflang_issue_pages": "indexation",
    "list_pages_mixed_language": "content",
    "list_misaligned_queries": "keywords",
    "list_referring_domains": "backlinks",
    "get_anchor_text_distribution": "backlinks",
    "list_backlinks_by_anchor_text": "backlinks",
    "list_backlinks_to_url": "backlinks",
    "list_backlinks_from_domain": "backlinks",
    "get_keyword_opportunity_score": "keywords",
    "list_sitemap_urls_not_in_crawl": "indexation",
    "list_crawl_urls_not_in_sitemap": "indexation",
    "list_log_googlebot_low_crawl": "ops",
    "list_redirect_chains_by_length": "crawl",
    "list_compare_new_issues": "drift",
    "list_compare_resolved_issues": "drift",
    "list_compare_lighthouse_regressions": "drift",
    "list_pages_ai_citation_signals": "geo",
    "list_pages_missing_llms_txt_reference": "geo",
    "list_robots_blocked_ai_crawlers": "geo",
    "list_pages_missing_howto_schema": "geo",
    "list_pages_missing_article_schema": "geo",
    "compare_geo_score_deltas": "geo",
    "check_ai_citations_live": "geo",
    "detect_prompt_injection": "geo",
    "get_negative_signals": "geo",
    "get_rag_chunk_readiness": "geo",
    "get_content_decay_signals": "geo",
    "get_multimodal_readiness": "geo",
    "get_topic_authority": "geo",
    "list_gsc_ctr_underperformers": "google",
    "get_sql_schema": "core",
    "run_sql_query": "core",
}

_ONPAGE_PREFIXES = (
    "list_pages_missing_",
    "list_pages_meta_desc_",
    "list_pages_multiple_h1",
    "list_pages_noindex",
    "list_seo_onpage",
    "list_content_url",
)

_INSIGHT_PREFIXES = (
    "get_landing_page_",
    "get_opportunity_",
    "get_traffic_health",
    "get_issue_to_traffic",
)

# MCP server bundles (WP_MCP_DOMAIN env).
MCP_DOMAIN_BUNDLES: dict[str, frozenset[str]] = {
    "core": frozenset({"core", "insight"}),
    "crawl": frozenset({"crawl", "onpage", "schema", "accessibility", "assets"}),
    "google": frozenset({"google", "insight", "ctr", "keywords", "integrations"}),
    "links": frozenset({"links", "backlinks", "indexation"}),
    "full": frozenset(CANONICAL_DOMAINS),
}

DOMAIN_EXAMPLE_PROMPTS: dict[str, str] = {
    "core": "What data do we have? Search for a specialized tool.",
    "portfolio": "Give me an audit overview and health score.",
    "issues": "What are the top critical issues to fix first?",
    "crawl": "List 4xx pages and redirect chains.",
    "onpage": "Which pages are missing title tags or meta descriptions?",
    "google": "Top GSC queries and GA4 landing page performance.",
    "insight": "High-click pages with low engagement — opportunity matrix.",
    "drift": "Compare this audit to the previous report.",
    "export": "Export the audit as PDF.",
    "keywords": "Striking-distance keywords and CTR opportunities.",
    "performance": "Lighthouse summary and Core Web Vitals failures.",
    "links": "Orphan pages and broken internal links.",
    "backlinks": "GSC backlinks sample and velocity.",
    "images": "Image audit summary and largest unoptimized images.",
    "geo": "GEO readiness score, citability, AI discovery, robots tiers, negative signals, prompt injection, topic authority.",
}


def classify_tool_domain(name: str) -> str:
    """Return canonical domain for a tool name."""
    if name in _DOMAIN_OVERRIDES:
        return _DOMAIN_OVERRIDES[name]
    if name.startswith("compare_"):
        return "drift"
    if name.startswith("list_compare_"):
        return "drift"
    if name in TIER_0_TOOLS:
        return _DOMAIN_OVERRIDES.get(name, "core")

    if name.startswith("export_") or name == "list_export_formats":
        return "export"
    if name.startswith((
        "get_image_", "list_pages_without_lazy", "list_pages_with_images_missing",
        "list_site_image", "list_lighthouse_image", "list_largest_images",
        "list_unoptimized_images", "list_images_needing",
    )):
        return "images"
    if name.startswith((
        "get_landing_page_", "get_opportunity_", "get_traffic_health", "get_issue_to_traffic",
    )):
        return "insight"
    if name.startswith((
        "get_geo_", "get_aeo_", "get_llms_", "get_eeat_", "get_faq_",
        "get_ai_discovery", "get_robots_ai_", "get_citability_",
        "list_pages_missing_faq", "draft_llms", "check_ai_citation",
        "generate_schema", "generate_robots_txt", "generate_meta_tags", "generate_geo_fix",
    )):
        return "geo"
    if "axe" in name or "mixed_content" in name or name == "get_heading_outline_for_url":
        return "accessibility"
    if name in (
        "get_asset_weight_summary", "get_readability_summary", "list_heavy_pages_by_bytes",
        "list_pages_poor_cache_headers", "list_pages_low_content_ratio",
    ):
        return "assets"
    if "ctr" in name or name in ("list_keywords_ctr_opportunity", "analyze_serp_snippet_for_url"):
        return "ctr"
    if name in ("get_gsc_url_inspection", "get_gsc_index_coverage", "get_bing_index_status", "get_serp_feature_overlay"):
        return "integrations"
    if any(name.startswith(p) for p in _ONPAGE_PREFIXES):
        return "onpage"
    if name.startswith((
        "list_propert", "get_propert", "get_report", "get_executive", "get_site", "list_report",
        "get_portfolio",
    )) or name in (
        "get_ads_txt_status", "get_security_txt_status", "get_contact_intelligence",
        "get_rich_results_summary", "list_rich_results_failures", "get_competitor_keyword_gap",
        "get_pagination_audit_summary", "get_portfolio_benchmark",
    ):
        return "portfolio"
    if name in (
        "list_top_impact_issues", "prioritize_fix_roadmap", "generate_issue_fix",
        "summarize_category_for_client",
    ) or "issue" in name or "category" in name or "workflow" in name:
        return "issues"
    if name.startswith((
        "list_pages_", "list_canonical", "list_long_", "list_robots_", "get_top_pages_by",
        "search_pages", "get_page_", "list_redirects", "list_broken", "list_status_",
        "get_status_code", "get_response_time", "get_depth", "get_crawl_", "get_browser",
        "list_pages_with", "list_pages_by", "list_pages_soft", "list_pages_poor",
        "list_dead_end", "list_duplicate_title", "list_heavy_pages",
    )):
        return "crawl"
    if "schema" in name or name == "get_seo_health":
        return "schema"
    if "orphan" in name or "link" in name or "fingerprint" in name or "pagerank" in name:
        return "links"
    if "indexation" in name or "hreflang" in name or "language" in name or name == "list_subdomains":
        return "indexation"
    if "content" in name or "social" in name or "ner" in name or "thin" in name or "opportunit" in name or "duplicate" in name:
        return "content"
    if "keyword" in name or "cannibal" in name or "misalignment" in name or "striking" in name or "semantic" in name or name in ("expand_keywords", "generate_content_brief"):
        return "keywords"
    if "google" in name or "gsc" in name or "ga4" in name:
        return "google"
    if "backlink" in name or "competitor" in name or "bing" in name or "gsc_links" in name:
        return "backlinks"
    if "lighthouse" in name or "crux" in name or "slow" in name or "cwv" in name:
        return "performance"
    if "health" in name or "compare" in name or "alert" in name or "tech_stack" in name or name == "list_pages_by_technology":
        return "drift"
    if "security" in name:
        return "security"
    if "log" in name or name in ("get_property_ops", "list_crawl_runs", "list_log_uploads", "get_page_coach"):
        return "ops"
    return "portfolio"


def _tags_for_tool(name: str, domain: str) -> list[str]:
    tags = [domain]
    parts = name.replace("_", " ").split()
    tags.extend(p for p in parts if len(p) > 2 and p not in tags)
    return tags[:8]


def build_tool_meta(tool_names: set[str] | frozenset[str]) -> dict[str, dict[str, Any]]:
    """Build TOOL_META for all registered tool names."""
    meta: dict[str, dict[str, Any]] = {}
    for name in sorted(tool_names):
        domain = classify_tool_domain(name)
        tier = 0 if name in TIER_0_TOOLS else 1
        meta[name] = {
            "domain": domain,
            "tier": tier,
            "tags": _tags_for_tool(name, domain),
        }
    return meta


def tools_by_domain(meta: dict[str, dict[str, Any]]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {d: [] for d in CANONICAL_DOMAINS}
    for name, info in meta.items():
        domain = str(info.get("domain") or "portfolio")
        if domain not in out:
            out[domain] = []
        out[domain].append(name)
    for domain in out:
        out[domain].sort()
    return out


def tool_names_for_domain(meta: dict[str, dict[str, Any]], domain: str) -> list[str]:
    by_domain = tools_by_domain(meta)
    return list(by_domain.get(domain) or [])


def tool_names_for_tier(meta: dict[str, dict[str, Any]], tier: int) -> list[str]:
    return sorted(name for name, info in meta.items() if info.get("tier") == tier)


def tool_names_for_mcp_bundle(meta: dict[str, dict[str, Any]], bundle: str) -> set[str]:
    """Return tool names exposed for an MCP domain bundle."""
    bundle_key = (bundle or "core").strip().lower()
    allowed_domains = MCP_DOMAIN_BUNDLES.get(bundle_key, MCP_DOMAIN_BUNDLES["core"])
    if bundle_key == "full":
        return set(meta.keys())
    names: set[str] = set()
    by_domain = tools_by_domain(meta)
    for domain in allowed_domains:
        names.update(by_domain.get(domain) or [])
    if bundle_key == "core":
        names.update(TIER_0_TOOLS & set(meta.keys()))
    return names


def domains_catalog(meta: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    by_domain = tools_by_domain(meta)
    rows: list[dict[str, Any]] = []
    for domain in CANONICAL_DOMAINS:
        tools = by_domain.get(domain) or []
        if not tools:
            continue
        rows.append({
            "domain": domain,
            "tool_count": len(tools),
            "example_prompt": DOMAIN_EXAMPLE_PROMPTS.get(domain, ""),
            "mcp_bundle": next(
                (b for b, domains in MCP_DOMAIN_BUNDLES.items() if domain in domains and b != "full"),
                "full",
            ),
        })
    return rows
