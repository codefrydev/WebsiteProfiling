"""Tool registry and dispatch for MCP and chat agent."""
from __future__ import annotations

import copy
from typing import Any, Callable

from psycopg import Connection

from ...db.storage import db_session

from .backlink_lists import (
    get_anchor_text_distribution,
    list_backlinks_by_anchor_text,
    list_backlinks_from_domain,
    list_backlinks_to_url,
    list_referring_domains,
)
from .compare_list_tools import (
    list_compare_lighthouse_regressions,
    list_compare_new_issues,
    list_compare_new_urls,
    list_compare_removed_urls,
    list_compare_resolved_issues,
    list_compare_traffic_losers,
)
from .content_lists import (
    get_text_content_analysis,
    list_amp_validation_issues,
    list_duplicate_content_pairs,
    list_html_validation_issues,
    list_pages_by_word_count_band,
    list_pages_containing_keyword,
    list_pages_missing_article_schema,
    list_pagination_issues,
    list_schema_errors_by_type,
    list_spell_check_issues,
)
from .geo_list_tools import (
    get_robots_ai_access_score,
    list_pages_ai_citation_signals,
    list_pages_missing_howto_schema,
    list_pages_missing_llms_txt_reference,
    list_robots_blocked_ai_crawlers,
)
from .geo_citability import (
    get_citability_score,
    get_citability_for_url,
)
from .geo_detectors import (
    detect_prompt_injection,
    get_content_decay_signals,
    get_multimodal_readiness,
    get_negative_signals,
    get_rag_chunk_readiness,
    get_topic_authority,
)
from .google_lists import (
    compare_gsc_periods,
    get_ga4_path_trend,
    get_gsc_page_trend,
    get_gsc_query_trend,
    get_gsc_site_benchmarks,
    list_ga4_landing_pages,
    list_ga4_pages_by_bounce_rate,
    list_ga4_pages_by_engagement_rate,
    list_gsc_branded_queries,
    list_gsc_ctr_underperformers,
    list_gsc_decaying_pages,
    list_gsc_decaying_queries,
    list_gsc_ga4_mismatch_pages,
    list_gsc_new_queries,
    list_gsc_non_branded_queries,
    list_gsc_pages_by_clicks,
    list_gsc_pages_by_impressions,
    list_gsc_pages_by_position_band,
    list_gsc_queries_by_clicks,
    list_gsc_queries_by_impressions,
)
from .indexation_lists import (
    list_crawl_urls_not_in_sitemap,
    list_hreflang_reciprocal_gaps,
    list_indexation_indexed_not_submitted,
    list_indexation_submitted_not_indexed,
    list_log_5xx_paths,
    list_log_googlebot_low_crawl,
    list_log_orphan_high_traffic,
    list_log_paths_by_hits,
    list_redirect_chains_by_length,
    list_sitemap_urls_not_in_crawl,
)
from .issue_lists import (
    list_hreflang_issue_pages,
    list_lighthouse_failure_cls,
    list_lighthouse_failure_inp,
    list_lighthouse_failure_lcp,
    list_lighthouse_failure_seo,
    list_orphan_hub_suggestions,
    list_pages_color_contrast_failures,
    list_pages_high_reading_level,
    list_pages_invalid_json_ld,
    list_pages_invalid_viewport,
    list_pages_missing_html_lang,
    list_pages_missing_og_tags,
    list_pages_missing_twitter_cards,
    list_pages_mixed_language,
    list_pages_slow_response,
    list_pages_title_too_long,
    list_pages_title_too_short,
    list_pages_very_thin_content,
)
from .keyword_lists import (
    get_keyword_opportunity_score,
    get_keyword_serp_snapshot,
    list_cannibalisation_queries,
    list_cannibalisation_urls,
    list_keyword_rank_declines,
    list_keyword_rank_improvements,
    list_keywords_by_competition_band,
    list_keywords_by_recommended_action,
    list_keywords_by_serp_feature,
    list_keywords_commercial_intent,
    list_keywords_fell_out_of_top_10,
    list_keywords_high_impression_zero_click,
    list_keywords_local_pack,
    list_keywords_near_page_one,
    list_keywords_new_to_top_10,
    list_keywords_question_intent,
    list_keywords_with_ai_overview,
    list_misaligned_queries,
    list_semantic_cluster_pages,
    list_semantic_cluster_queries,
)
from .link_lists import (
    list_internal_links_from_url,
    list_internal_links_to_url,
    list_links_by_rel_nofollow,
    list_outbound_links,
    list_pagerank_low_pages,
)
from .backlinks import (
    get_backlinks_velocity,
    get_bing_backlinks_summary,
    get_competitor_link_gap,
    get_gsc_latest_links,
    get_gsc_links_import_status,
    get_gsc_links_summary,
    get_gsc_sample_links,
    get_third_party_links_overlay,
)
from .charts import (
    get_crawl_summary,
    get_domain_link_distribution,
    get_issue_priority_breakdown,
    get_mime_type_breakdown,
    get_outlink_distribution,
    get_title_length_distribution,
    get_top_crawled_pages,
)
from .data_coverage import get_data_coverage_report
from .insight_tools import (
    get_issue_to_traffic_map,
    get_landing_page_blended_table,
    get_landing_page_full_diagnosis,
    get_opportunity_matrix,
    get_traffic_health_check,
)
from .router_tools import (
    list_tool_domains,
    run_domain_agent,
    run_insight_workflow,
    run_keyword_workflow,
    run_technical_workflow,
    search_audit_tools,
)
from .compare import compare_reports
from .compare_slices import (
    compare_category_deltas,
    compare_content_metrics,
    compare_duplicate_deltas,
    compare_geo_score_deltas,
    compare_google_metrics,
    compare_health_score_delta,
    compare_indexation_deltas,
    compare_issue_deltas,
    compare_lighthouse_deltas,
    compare_link_metric_deltas,
    compare_orphan_deltas,
    compare_priority_counts,
    compare_redirect_deltas,
    compare_security_deltas,
    compare_seo_health_deltas,
    compare_tech_deltas,
    compare_url_set_diff,
)
from .crawl_metrics import get_asset_weight_summary, get_readability_summary
from .content import (
    get_content_analytics,
    get_content_duplicates,
    get_duplicate_cluster,
    get_keyword_opportunities,
    get_ner_site_summary,
    get_social_coverage,
    list_thin_content_pages,
)
from .context import AuditToolContext
from .crawl_lists import (
    get_axe_audit_summary,
    get_heading_outline_for_url,
    get_top_pages_by_pagerank,
    list_canonical_mismatch,
    list_dead_end_pages,
    list_duplicate_title_groups,
    list_heavy_pages_by_bytes,
    list_long_redirect_chains,
    list_pages_low_content_ratio,
    list_pages_missing_canonical,
    list_pages_missing_og_image,
    list_pages_missing_viewport,
    list_pages_poor_cache_headers,
    list_pages_skipped_headings,
    list_pages_soft_404,
    list_pages_with_axe_violations,
    list_pages_with_missing_alt,
    list_pages_with_mixed_content,
    list_robots_blocked_urls,
)
from .geo_tools import (
    get_aeo_content_signals_for_url,
    get_ai_discovery_status,
    get_eeat_signals_summary,
    get_faq_schema_coverage,
    get_geo_readiness_score,
    get_internal_link_suggestions,
    get_js_rendering_delta,
    get_llms_txt_status,
    list_pages_missing_faq_schema,
)
from .crawl import (
    get_browser_diagnostics_summary,
    get_crawl_links_table,
    get_crawl_segments,
    get_depth_distribution,
    get_graph_edges_sample,
    get_internal_links,
    get_page_analysis,
    get_page_details,
    get_response_time_stats,
    get_seo_health,
    get_status_code_breakdown,
    list_broken_links,
    list_pages_by_fetch_method,
    list_pages_with_console_errors,
    list_pages_console_errors_by_type,
    list_pages_js_rendering_delta,
    list_redirects,
    list_status_4xx_pages,
    list_status_5xx_pages,
    search_pages,
    search_pages_advanced,
)
from .google import (
    get_ga4_by_channel,
    get_ga4_by_device,
    get_ga4_daily_trend,
    get_ga4_page_metrics,
    get_ga4_summary,
    get_google_summary,
    get_gsc_ctr_opportunity_pages,
    get_gsc_daily_trend,
    get_gsc_page_queries,
    get_gsc_page_query_slice,
    get_gsc_top_pages,
    get_gsc_top_queries,
)
from .integration_tools import (
    check_ai_citation_presence,
    check_ai_citations_live,
    get_bing_index_status,
    get_gsc_index_coverage,
    get_gsc_url_inspection,
    get_serp_feature_overlay,
)
from .health import get_category_health_history, get_health_history, list_report_history
from .indexation_tools import get_indexation_coverage, get_indexation_url_join, list_indexation_gaps
from .international import get_hreflang_summary, get_language_summary
from .issues import get_category_issues, list_issues_by_category
from .keywords import (
    get_brand_keyword_split,
    get_keyword_cannibalisation,
    get_keyword_history,
    get_keyword_serp_overlay,
    get_keyword_summary,
    get_query_page_misalignment,
    get_semantic_keyword_clusters,
    get_striking_distance_keywords,
    list_keywords_by_action,
    list_keywords_by_impressions,
    list_keywords_by_intent,
    list_keywords_by_position,
    list_keywords_ctr_opportunity,
    search_keywords,
)
from .lighthouse import (
    get_crux_summary,
    get_lighthouse_diagnostics,
    get_lighthouse_for_url,
    get_lighthouse_human_summary,
    get_lighthouse_summary,
    list_lighthouse_cwv_failures,
    list_lighthouse_poor_accessibility_pages,
    list_lighthouse_poor_best_practices_pages,
    list_lighthouse_poor_seo_pages,
    list_slow_pages,
)
from .export_tools import (
    export_audit_report,
    export_compare_csv,
    export_list_as_csv,
    list_export_formats,
)
from .export_extras import export_sitemap_xml, validate_rich_results
from .image_tools import (
    get_image_audit_summary,
    list_images_needing_attention,
    list_largest_images,
    list_lighthouse_image_opportunities,
    list_pages_with_images_missing_dimensions,
    list_pages_without_lazy_images,
    list_site_image_urls,
    list_unoptimized_images,
)
from .llm_tools import (
    analyze_serp_snippet_for_url,
    draft_llms_txt,
    expand_keywords,
    generate_content_brief,
    generate_geo_fix_bundle,
    generate_issue_fix,
    generate_meta_tags,
    generate_robots_txt,
    generate_schema,
    get_page_coach,
    get_portfolio_summary,
    prioritize_fix_roadmap,
    summarize_category_for_client,
)
from .payload_extras import (
    get_competitor_keyword_gap,
    get_pagination_audit_summary,
    get_portfolio_benchmark,
    get_rich_results_summary,
    get_site_anchor_text_summary,
    list_rich_results_failures,
)
from .onpage import (
    list_content_url_issues,
    list_pages_meta_desc_too_long,
    list_pages_meta_desc_too_short,
    list_pages_missing_h1,
    list_pages_missing_meta_description,
    list_pages_missing_title,
    list_pages_multiple_h1,
    list_pages_noindex,
    list_seo_onpage_issues,
)
from .links import (
    get_inlink_anchors,
    get_link_graph_summary,
    get_link_rel_summary,
    get_outbound_link_domains,
    get_top_linked_pages,
    get_url_fingerprints,
    list_broken_link_sources,
    list_nofollow_internal_links,
    list_orphan_pages,
)
from .ops import (
    get_google_integration_status,
    get_integration_alerts,
    get_latest_log_analysis,
    get_log_analysis_by_id,
    get_log_googlebot_stats,
    get_log_top_paths,
    get_property_ops,
    list_crawl_only_paths,
    list_crawl_runs,
    list_log_only_paths,
    list_log_uploads,
)
from .properties import get_property, list_properties
from .property_profile import (
    get_ads_txt_status,
    get_contact_intelligence,
    get_security_txt_status,
    list_subdomains,
)
from .report import (
    get_category_scores,
    get_critical_issues,
    get_executive_summary,
    get_report_meta,
    get_report_summary,
    get_site_level,
    list_issues,
    list_top_impact_issues,
    search_issues,
)
from .report_extras import (
    get_audit_recommendations,
    get_category_recommendations,
    get_ml_errors,
    get_ssl_expiry_info,
    list_audit_categories,
    list_issues_with_ai_fixes,
)
from .schema import get_schema_coverage, list_pages_without_schema, search_pages_by_schema_type
from .security import (
    get_security_findings,
    get_security_findings_summary,
    list_security_findings_by_type,
)
from .tech import get_tech_stack_summary, list_pages_by_technology
from .tool_catalog import TOOL_DEFINITIONS
from .tool_domains import (
    TIER_0_TOOLS,
    build_tool_meta,
    classify_tool_domain,
    domains_catalog,
    tool_names_for_domain as _meta_tool_names_for_domain,
    tool_names_for_mcp_bundle,
    tool_names_for_tier as _meta_tool_names_for_tier,
    tools_by_domain,
)
from .workflow import list_issue_workflow

ToolHandler = Callable[[Connection, AuditToolContext, dict[str, Any]], dict[str, Any]]

_TOOL_HANDLERS: dict[str, ToolHandler] = {
    "list_properties": list_properties,
    "get_property": get_property,
    "get_report_summary": get_report_summary,
    "get_category_scores": get_category_scores,
    "get_executive_summary": get_executive_summary,
    "get_report_meta": get_report_meta,
    "get_site_level": get_site_level,
    "list_report_history": list_report_history,
    "list_issues": list_issues,
    "get_critical_issues": get_critical_issues,
    "list_issues_by_category": list_issues_by_category,
    "get_category_issues": get_category_issues,
    "list_issue_workflow": list_issue_workflow,
    "search_pages": search_pages,
    "get_page_details": get_page_details,
    "get_internal_links": get_internal_links,
    "list_redirects": list_redirects,
    "list_broken_links": list_broken_links,
    "get_status_code_breakdown": get_status_code_breakdown,
    "get_response_time_stats": get_response_time_stats,
    "get_depth_distribution": get_depth_distribution,
    "get_crawl_segments": get_crawl_segments,
    "get_browser_diagnostics_summary": get_browser_diagnostics_summary,
    "get_schema_coverage": get_schema_coverage,
    "list_pages_without_schema": list_pages_without_schema,
    "search_pages_by_schema_type": search_pages_by_schema_type,
    "get_seo_health": get_seo_health,
    "list_orphan_pages": list_orphan_pages,
    "get_top_linked_pages": get_top_linked_pages,
    "get_outbound_link_domains": get_outbound_link_domains,
    "get_link_graph_summary": get_link_graph_summary,
    "get_url_fingerprints": get_url_fingerprints,
    "get_indexation_coverage": get_indexation_coverage,
    "get_hreflang_summary": get_hreflang_summary,
    "get_language_summary": get_language_summary,
    "get_content_analytics": get_content_analytics,
    "get_content_duplicates": get_content_duplicates,
    "get_social_coverage": get_social_coverage,
    "get_keyword_opportunities": get_keyword_opportunities,
    "get_ner_site_summary": get_ner_site_summary,
    "list_thin_content_pages": list_thin_content_pages,
    "get_keyword_summary": get_keyword_summary,
    "search_keywords": search_keywords,
    "get_striking_distance_keywords": get_striking_distance_keywords,
    "get_keyword_cannibalisation": get_keyword_cannibalisation,
    "get_query_page_misalignment": get_query_page_misalignment,
    "get_semantic_keyword_clusters": get_semantic_keyword_clusters,
    "get_keyword_history": get_keyword_history,
    "get_google_summary": get_google_summary,
    "get_gsc_top_queries": get_gsc_top_queries,
    "get_gsc_top_pages": get_gsc_top_pages,
    "get_ga4_summary": get_ga4_summary,
    "get_gsc_page_query_slice": get_gsc_page_query_slice,
    "get_gsc_links_summary": get_gsc_links_summary,
    "get_gsc_links_import_status": get_gsc_links_import_status,
    "get_competitor_link_gap": get_competitor_link_gap,
    "get_bing_backlinks_summary": get_bing_backlinks_summary,
    "get_lighthouse_summary": get_lighthouse_summary,
    "get_lighthouse_for_url": get_lighthouse_for_url,
    "get_lighthouse_diagnostics": get_lighthouse_diagnostics,
    "get_crux_summary": get_crux_summary,
    "list_slow_pages": list_slow_pages,
    "get_health_history": get_health_history,
    "compare_reports": compare_reports,
    "get_integration_alerts": get_integration_alerts,
    "get_tech_stack_summary": get_tech_stack_summary,
    "get_security_findings": get_security_findings,
    "get_audit_recommendations": get_audit_recommendations,
    "get_ml_errors": get_ml_errors,
    "get_ssl_expiry_info": get_ssl_expiry_info,
    "get_ads_txt_status": get_ads_txt_status,
    "get_security_txt_status": get_security_txt_status,
    "list_subdomains": list_subdomains,
    "get_contact_intelligence": get_contact_intelligence,
    "list_audit_categories": list_audit_categories,
    "get_category_recommendations": get_category_recommendations,
    "list_issues_with_ai_fixes": list_issues_with_ai_fixes,
    "list_seo_onpage_issues": list_seo_onpage_issues,
    "list_content_url_issues": list_content_url_issues,
    "list_pages_missing_title": list_pages_missing_title,
    "list_pages_missing_h1": list_pages_missing_h1,
    "list_pages_multiple_h1": list_pages_multiple_h1,
    "list_pages_missing_meta_description": list_pages_missing_meta_description,
    "list_pages_meta_desc_too_short": list_pages_meta_desc_too_short,
    "list_pages_meta_desc_too_long": list_pages_meta_desc_too_long,
    "list_pages_noindex": list_pages_noindex,
    "get_crawl_summary": get_crawl_summary,
    "get_issue_priority_breakdown": get_issue_priority_breakdown,
    "get_mime_type_breakdown": get_mime_type_breakdown,
    "get_title_length_distribution": get_title_length_distribution,
    "get_domain_link_distribution": get_domain_link_distribution,
    "get_outlink_distribution": get_outlink_distribution,
    "get_top_crawled_pages": get_top_crawled_pages,
    "list_indexation_gaps": list_indexation_gaps,
    "get_indexation_url_join": get_indexation_url_join,
    "get_gsc_sample_links": get_gsc_sample_links,
    "get_gsc_latest_links": get_gsc_latest_links,
    "get_third_party_links_overlay": get_third_party_links_overlay,
    "get_backlinks_velocity": get_backlinks_velocity,
    "get_property_ops": get_property_ops,
    "get_google_integration_status": get_google_integration_status,
    "list_crawl_runs": list_crawl_runs,
    "list_log_uploads": list_log_uploads,
    "get_latest_log_analysis": get_latest_log_analysis,
    "get_keyword_serp_overlay": get_keyword_serp_overlay,
    "list_keywords_by_action": list_keywords_by_action,
    "list_keywords_by_position": list_keywords_by_position,
    "list_keywords_by_impressions": list_keywords_by_impressions,
    "get_lighthouse_human_summary": get_lighthouse_human_summary,
    "list_lighthouse_poor_seo_pages": list_lighthouse_poor_seo_pages,
    "get_page_analysis": get_page_analysis,
    "search_pages_advanced": search_pages_advanced,
    "list_pages_with_console_errors": list_pages_with_console_errors,
    "list_pages_by_fetch_method": list_pages_by_fetch_method,
    "get_crawl_links_table": get_crawl_links_table,
    "get_graph_edges_sample": get_graph_edges_sample,
    "list_status_4xx_pages": list_status_4xx_pages,
    "list_status_5xx_pages": list_status_5xx_pages,
    "get_ga4_page_metrics": get_ga4_page_metrics,
    "get_category_health_history": get_category_health_history,
    "compare_issue_deltas": compare_issue_deltas,
    "compare_category_deltas": compare_category_deltas,
    "compare_seo_health_deltas": compare_seo_health_deltas,
    "compare_lighthouse_deltas": compare_lighthouse_deltas,
    "compare_url_set_diff": compare_url_set_diff,
    "compare_redirect_deltas": compare_redirect_deltas,
    "compare_link_metric_deltas": compare_link_metric_deltas,
    "compare_security_deltas": compare_security_deltas,
    "compare_duplicate_deltas": compare_duplicate_deltas,
    "compare_tech_deltas": compare_tech_deltas,
    "compare_content_metrics": compare_content_metrics,
    "compare_google_metrics": compare_google_metrics,
    "compare_priority_counts": compare_priority_counts,
    "compare_health_score_delta": compare_health_score_delta,
    "list_pages_missing_canonical": list_pages_missing_canonical,
    "list_canonical_mismatch": list_canonical_mismatch,
    "list_pages_with_missing_alt": list_pages_with_missing_alt,
    "list_pages_skipped_headings": list_pages_skipped_headings,
    "list_pages_missing_viewport": list_pages_missing_viewport,
    "list_long_redirect_chains": list_long_redirect_chains,
    "list_robots_blocked_urls": list_robots_blocked_urls,
    "list_pages_missing_og_image": list_pages_missing_og_image,
    "get_top_pages_by_pagerank": get_top_pages_by_pagerank,
    "get_log_top_paths": get_log_top_paths,
    "list_log_only_paths": list_log_only_paths,
    "list_crawl_only_paths": list_crawl_only_paths,
    "get_log_googlebot_stats": get_log_googlebot_stats,
    "get_log_analysis_by_id": get_log_analysis_by_id,
    "list_lighthouse_poor_accessibility_pages": list_lighthouse_poor_accessibility_pages,
    "list_lighthouse_poor_best_practices_pages": list_lighthouse_poor_best_practices_pages,
    "list_lighthouse_cwv_failures": list_lighthouse_cwv_failures,
    "list_pages_by_technology": list_pages_by_technology,
    "get_duplicate_cluster": get_duplicate_cluster,
    "get_security_findings_summary": get_security_findings_summary,
    "list_security_findings_by_type": list_security_findings_by_type,
    "list_broken_link_sources": list_broken_link_sources,
    "get_link_rel_summary": get_link_rel_summary,
    "get_inlink_anchors": get_inlink_anchors,
    "list_nofollow_internal_links": list_nofollow_internal_links,
    "search_issues": search_issues,
    "generate_content_brief": generate_content_brief,
    "get_page_coach": get_page_coach,
    "get_portfolio_summary": get_portfolio_summary,
    "expand_keywords": expand_keywords,
    "export_audit_report": export_audit_report,
    "export_compare_csv": export_compare_csv,
    "export_list_as_csv": export_list_as_csv,
    "list_export_formats": list_export_formats,
    "export_sitemap_xml": export_sitemap_xml,
    "validate_rich_results": validate_rich_results,
    "get_image_audit_summary": get_image_audit_summary,
    "list_pages_without_lazy_images": list_pages_without_lazy_images,
    "list_pages_with_images_missing_dimensions": list_pages_with_images_missing_dimensions,
    "list_site_image_urls": list_site_image_urls,
    "list_lighthouse_image_opportunities": list_lighthouse_image_opportunities,
    "list_largest_images": list_largest_images,
    "list_unoptimized_images": list_unoptimized_images,
    "list_images_needing_attention": list_images_needing_attention,
    "list_top_impact_issues": list_top_impact_issues,
    "get_rich_results_summary": get_rich_results_summary,
    "list_rich_results_failures": list_rich_results_failures,
    "get_competitor_keyword_gap": get_competitor_keyword_gap,
    "get_portfolio_benchmark": get_portfolio_benchmark,
    "get_site_anchor_text_summary": get_site_anchor_text_summary,
    "get_pagination_audit_summary": get_pagination_audit_summary,
    "list_pages_soft_404": list_pages_soft_404,
    "list_pages_with_axe_violations": list_pages_with_axe_violations,
    "get_axe_audit_summary": get_axe_audit_summary,
    "list_pages_with_mixed_content": list_pages_with_mixed_content,
    "list_dead_end_pages": list_dead_end_pages,
    "list_duplicate_title_groups": list_duplicate_title_groups,
    "list_heavy_pages_by_bytes": list_heavy_pages_by_bytes,
    "list_pages_poor_cache_headers": list_pages_poor_cache_headers,
    "list_pages_low_content_ratio": list_pages_low_content_ratio,
    "get_heading_outline_for_url": get_heading_outline_for_url,
    "get_asset_weight_summary": get_asset_weight_summary,
    "get_readability_summary": get_readability_summary,
    "list_keywords_ctr_opportunity": list_keywords_ctr_opportunity,
    "get_gsc_ctr_opportunity_pages": get_gsc_ctr_opportunity_pages,
    "compare_indexation_deltas": compare_indexation_deltas,
    "compare_orphan_deltas": compare_orphan_deltas,
    "compare_geo_score_deltas": compare_geo_score_deltas,
    "get_llms_txt_status": get_llms_txt_status,
    "get_ai_discovery_status": get_ai_discovery_status,
    "get_faq_schema_coverage": get_faq_schema_coverage,
    "list_pages_missing_faq_schema": list_pages_missing_faq_schema,
    "get_geo_readiness_score": get_geo_readiness_score,
    "get_aeo_content_signals_for_url": get_aeo_content_signals_for_url,
    "get_eeat_signals_summary": get_eeat_signals_summary,
    "get_js_rendering_delta": get_js_rendering_delta,
    "get_internal_link_suggestions": get_internal_link_suggestions,
    "get_robots_ai_access_score": get_robots_ai_access_score,
    "get_citability_score": get_citability_score,
    "get_citability_for_url": get_citability_for_url,
    "get_negative_signals": get_negative_signals,
    "detect_prompt_injection": detect_prompt_injection,
    "get_rag_chunk_readiness": get_rag_chunk_readiness,
    "get_content_decay_signals": get_content_decay_signals,
    "get_multimodal_readiness": get_multimodal_readiness,
    "get_topic_authority": get_topic_authority,
    "generate_issue_fix": generate_issue_fix,
    "summarize_category_for_client": summarize_category_for_client,
    "prioritize_fix_roadmap": prioritize_fix_roadmap,
    "analyze_serp_snippet_for_url": analyze_serp_snippet_for_url,
    "draft_llms_txt": draft_llms_txt,
    "generate_schema": generate_schema,
    "generate_robots_txt": generate_robots_txt,
    "generate_meta_tags": generate_meta_tags,
    "generate_geo_fix_bundle": generate_geo_fix_bundle,
    "get_gsc_url_inspection": get_gsc_url_inspection,
    "get_gsc_index_coverage": get_gsc_index_coverage,
    "get_bing_index_status": get_bing_index_status,
    "get_serp_feature_overlay": get_serp_feature_overlay,
    "check_ai_citation_presence": check_ai_citation_presence,
    "check_ai_citations_live": check_ai_citations_live,
    "search_audit_tools": search_audit_tools,
    "list_tool_domains": list_tool_domains,
    "get_data_coverage_report": get_data_coverage_report,
    "run_insight_workflow": run_insight_workflow,
    "run_technical_workflow": run_technical_workflow,
    "run_keyword_workflow": run_keyword_workflow,
    "run_domain_agent": run_domain_agent,
    "get_landing_page_blended_table": get_landing_page_blended_table,
    "get_opportunity_matrix": get_opportunity_matrix,
    "get_traffic_health_check": get_traffic_health_check,
    "get_landing_page_full_diagnosis": get_landing_page_full_diagnosis,
    "get_issue_to_traffic_map": get_issue_to_traffic_map,
    "get_gsc_daily_trend": get_gsc_daily_trend,
    "get_ga4_daily_trend": get_ga4_daily_trend,
    "get_ga4_by_device": get_ga4_by_device,
    "get_ga4_by_channel": get_ga4_by_channel,
    "get_gsc_page_queries": get_gsc_page_queries,
    "get_brand_keyword_split": get_brand_keyword_split,
    "list_keywords_by_intent": list_keywords_by_intent,
    "list_pages_title_too_short": list_pages_title_too_short,
    "list_pages_title_too_long": list_pages_title_too_long,
    "list_pages_slow_response": list_pages_slow_response,
    "list_pages_missing_html_lang": list_pages_missing_html_lang,
    "list_pages_invalid_viewport": list_pages_invalid_viewport,
    "list_pages_color_contrast_failures": list_pages_color_contrast_failures,
    "list_pages_high_reading_level": list_pages_high_reading_level,
    "list_pages_very_thin_content": list_pages_very_thin_content,
    "list_hreflang_issue_pages": list_hreflang_issue_pages,
    "list_pages_missing_og_tags": list_pages_missing_og_tags,
    "list_pages_missing_twitter_cards": list_pages_missing_twitter_cards,
    "list_pages_invalid_json_ld": list_pages_invalid_json_ld,
    "list_pages_mixed_language": list_pages_mixed_language,
    "list_orphan_hub_suggestions": list_orphan_hub_suggestions,
    "list_lighthouse_failure_lcp": list_lighthouse_failure_lcp,
    "list_lighthouse_failure_inp": list_lighthouse_failure_inp,
    "list_lighthouse_failure_cls": list_lighthouse_failure_cls,
    "list_lighthouse_failure_seo": list_lighthouse_failure_seo,
    "list_gsc_pages_by_impressions": list_gsc_pages_by_impressions,
    "list_gsc_pages_by_clicks": list_gsc_pages_by_clicks,
    "list_gsc_queries_by_impressions": list_gsc_queries_by_impressions,
    "list_gsc_queries_by_clicks": list_gsc_queries_by_clicks,
    "list_gsc_ctr_underperformers": list_gsc_ctr_underperformers,
    "list_gsc_decaying_pages": list_gsc_decaying_pages,
    "list_gsc_decaying_queries": list_gsc_decaying_queries,
    "list_gsc_new_queries": list_gsc_new_queries,
    "list_ga4_landing_pages": list_ga4_landing_pages,
    "list_ga4_pages_by_bounce_rate": list_ga4_pages_by_bounce_rate,
    "list_ga4_pages_by_engagement_rate": list_ga4_pages_by_engagement_rate,
    "get_gsc_query_trend": get_gsc_query_trend,
    "get_gsc_page_trend": get_gsc_page_trend,
    "get_ga4_path_trend": get_ga4_path_trend,
    "list_gsc_ga4_mismatch_pages": list_gsc_ga4_mismatch_pages,
    "list_gsc_pages_by_position_band": list_gsc_pages_by_position_band,
    "get_gsc_site_benchmarks": get_gsc_site_benchmarks,
    "list_gsc_branded_queries": list_gsc_branded_queries,
    "list_gsc_non_branded_queries": list_gsc_non_branded_queries,
    "compare_gsc_periods": compare_gsc_periods,
    "list_keyword_rank_improvements": list_keyword_rank_improvements,
    "list_keyword_rank_declines": list_keyword_rank_declines,
    "list_keywords_new_to_top_10": list_keywords_new_to_top_10,
    "list_keywords_fell_out_of_top_10": list_keywords_fell_out_of_top_10,
    "list_cannibalisation_queries": list_cannibalisation_queries,
    "list_cannibalisation_urls": list_cannibalisation_urls,
    "list_misaligned_queries": list_misaligned_queries,
    "list_keywords_by_recommended_action": list_keywords_by_recommended_action,
    "list_keywords_by_serp_feature": list_keywords_by_serp_feature,
    "list_semantic_cluster_queries": list_semantic_cluster_queries,
    "list_semantic_cluster_pages": list_semantic_cluster_pages,
    "get_keyword_opportunity_score": get_keyword_opportunity_score,
    "list_keywords_near_page_one": list_keywords_near_page_one,
    "list_keywords_high_impression_zero_click": list_keywords_high_impression_zero_click,
    "list_keywords_by_competition_band": list_keywords_by_competition_band,
    "get_keyword_serp_snapshot": get_keyword_serp_snapshot,
    "list_keywords_with_ai_overview": list_keywords_with_ai_overview,
    "list_keywords_local_pack": list_keywords_local_pack,
    "list_keywords_question_intent": list_keywords_question_intent,
    "list_keywords_commercial_intent": list_keywords_commercial_intent,
    "list_referring_domains": list_referring_domains,
    "list_backlinks_by_anchor_text": list_backlinks_by_anchor_text,
    "list_backlinks_to_url": list_backlinks_to_url,
    "list_backlinks_from_domain": list_backlinks_from_domain,
    "get_anchor_text_distribution": get_anchor_text_distribution,
    "get_text_content_analysis": get_text_content_analysis,
    "list_pages_containing_keyword": list_pages_containing_keyword,
    "list_pages_by_word_count_band": list_pages_by_word_count_band,
    "list_duplicate_content_pairs": list_duplicate_content_pairs,
    "list_spell_check_issues": list_spell_check_issues,
    "list_html_validation_issues": list_html_validation_issues,
    "list_amp_validation_issues": list_amp_validation_issues,
    "list_pagination_issues": list_pagination_issues,
    "list_schema_errors_by_type": list_schema_errors_by_type,
    "list_pages_missing_article_schema": list_pages_missing_article_schema,
    "list_outbound_links": list_outbound_links,
    "list_internal_links_from_url": list_internal_links_from_url,
    "list_internal_links_to_url": list_internal_links_to_url,
    "list_links_by_rel_nofollow": list_links_by_rel_nofollow,
    "list_pagerank_low_pages": list_pagerank_low_pages,
    "list_indexation_submitted_not_indexed": list_indexation_submitted_not_indexed,
    "list_indexation_indexed_not_submitted": list_indexation_indexed_not_submitted,
    "list_sitemap_urls_not_in_crawl": list_sitemap_urls_not_in_crawl,
    "list_crawl_urls_not_in_sitemap": list_crawl_urls_not_in_sitemap,
    "list_log_paths_by_hits": list_log_paths_by_hits,
    "list_log_5xx_paths": list_log_5xx_paths,
    "list_log_googlebot_low_crawl": list_log_googlebot_low_crawl,
    "list_log_orphan_high_traffic": list_log_orphan_high_traffic,
    "list_redirect_chains_by_length": list_redirect_chains_by_length,
    "list_hreflang_reciprocal_gaps": list_hreflang_reciprocal_gaps,
    "list_compare_new_issues": list_compare_new_issues,
    "list_compare_resolved_issues": list_compare_resolved_issues,
    "list_compare_new_urls": list_compare_new_urls,
    "list_compare_removed_urls": list_compare_removed_urls,
    "list_compare_lighthouse_regressions": list_compare_lighthouse_regressions,
    "list_compare_traffic_losers": list_compare_traffic_losers,
    "list_pages_missing_howto_schema": list_pages_missing_howto_schema,
    "list_pages_ai_citation_signals": list_pages_ai_citation_signals,
    "list_pages_missing_llms_txt_reference": list_pages_missing_llms_txt_reference,
    "list_robots_blocked_ai_crawlers": list_robots_blocked_ai_crawlers,
    "list_pages_console_errors_by_type": list_pages_console_errors_by_type,
    "list_pages_js_rendering_delta": list_pages_js_rendering_delta,
}


_CONTEXT_SCOPED_PARAMS = frozenset({"property_id", "report_id"})


def _schema_for_llm(input_schema: dict[str, Any], *, context_scoped: bool) -> dict[str, Any]:
    """Drop session-scoped IDs from LLM tool schemas (chat injects them from AuditToolContext)."""
    if not context_scoped:
        return input_schema
    schema = copy.deepcopy(input_schema)
    props = dict(schema.get("properties") or {})
    for key in _CONTEXT_SCOPED_PARAMS:
        props.pop(key, None)
    schema["properties"] = props
    schema["required"] = [
        key for key in (schema.get("required") or []) if key not in _CONTEXT_SCOPED_PARAMS
    ]
    return schema


def _normalize_tool_args(args: dict[str, Any] | None) -> dict[str, Any]:
    """Remove explicit nulls so strict providers do not reject tool-call JSON."""
    if not isinstance(args, dict):
        return {}
    return {key: value for key, value in args.items() if value is not None}


def dispatch_tool(
    name: str,
    args: dict[str, Any] | None,
    *,
    context: AuditToolContext | None = None,
    conn: Connection | None = None,
) -> dict[str, Any]:
    """Run a tool by name. Uses db_session when conn is not provided."""
    handler = _TOOL_HANDLERS.get(name)
    if handler is None:
        return {"error": f"unknown tool: {name}"}

    ctx = context or AuditToolContext()
    payload_args = _normalize_tool_args(args)
    merged_ctx = ctx.with_args(payload_args)

    if conn is not None:
        return handler(conn, merged_ctx, payload_args)

    with db_session() as session:
        return handler(session, merged_ctx, payload_args)


_TOOL_DEFINITIONS_BY_NAME: dict[str, dict[str, Any]] = {t["name"]: t for t in TOOL_DEFINITIONS}
_TOOL_META: dict[str, dict[str, Any]] = build_tool_meta(set(_TOOL_HANDLERS.keys()))


def tool_meta() -> dict[str, dict[str, Any]]:
    return _TOOL_META


def tool_definition(name: str) -> dict[str, Any] | None:
    return _TOOL_DEFINITIONS_BY_NAME.get(name)


def tool_names_for_domain(domain: str) -> list[str]:
    return _meta_tool_names_for_domain(_TOOL_META, domain)


def tool_names_for_tier(tier: int) -> list[str]:
    return _meta_tool_names_for_tier(_TOOL_META, tier)


def tier0_tool_names() -> set[str]:
    return set(TIER_0_TOOLS) & set(_TOOL_HANDLERS.keys())


def mcp_tool_names(bundle: str) -> set[str]:
    return tool_names_for_mcp_bundle(_TOOL_META, bundle) & set(_TOOL_HANDLERS.keys())


def tools_catalog_by_domain() -> dict[str, list[str]]:
    return tools_by_domain(_TOOL_META)


def list_domains_catalog() -> list[dict[str, Any]]:
    return domains_catalog(_TOOL_META)


def search_tools(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Keyword search over tool name, description, tags, and domain."""
    q = (query or "").strip().lower()
    if not q:
        return []
    tokens = [t for t in q.replace("/", " ").split() if t]
    scored: list[tuple[int, str, dict[str, Any]]] = []
    for tool in TOOL_DEFINITIONS:
        name = tool["name"]
        desc = str(tool.get("description") or "").lower()
        meta = _TOOL_META.get(name) or {}
        domain = str(meta.get("domain") or classify_tool_domain(name))
        tags = " ".join(str(t) for t in (meta.get("tags") or []))
        haystack = f"{name} {desc} {domain} {tags}".lower()
        score = 0
        if q in name:
            score += 100
        if q in haystack:
            score += 40
        for tok in tokens:
            if tok in name:
                score += 30
            elif tok in haystack:
                score += 10
        if score <= 0:
            continue
        scored.append((score, name, {
            "name": name,
            "description": tool.get("description", ""),
            "domain": domain,
            "tier": meta.get("tier", 1),
        }))
    scored.sort(key=lambda x: (-x[0], x[1]))
    cap = max(1, min(int(limit or 10), 50))
    return [row for _, _, row in scored[:cap]]


def openai_tools_schema(
    names: set[str] | None = None,
    *,
    context_scoped: bool = False,
) -> list[dict[str, Any]]:
    """Convert TOOL_DEFINITIONS to OpenAI function-calling format (optional name filter)."""
    out: list[dict[str, Any]] = []
    for tool in TOOL_DEFINITIONS:
        if names is not None and tool["name"] not in names:
            continue
        input_schema = tool.get("inputSchema", {"type": "object", "properties": {}})
        out.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": _schema_for_llm(input_schema, context_scoped=context_scoped),
            },
        })
    return out


def tool_handler_names() -> set[str]:
    return set(_TOOL_HANDLERS.keys())


def validate_tool_registry() -> list[str]:
    """Return validation errors for catalog/handler/meta parity."""
    errors: list[str] = []
    handler_names = tool_handler_names()
    catalog_names = {t["name"] for t in TOOL_DEFINITIONS}
    meta_names = set(_TOOL_META.keys())
    if handler_names != catalog_names:
        errors.append(f"handler/catalog mismatch: handlers={len(handler_names)} catalog={len(catalog_names)}")
    if handler_names != meta_names:
        errors.append(f"handler/meta mismatch: handlers={len(handler_names)} meta={len(meta_names)}")
    missing_t0 = TIER_0_TOOLS - handler_names
    if missing_t0:
        errors.append(f"tier0 tools missing handlers: {sorted(missing_t0)}")
    return errors
