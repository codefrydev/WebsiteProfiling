using System.Text.Json.Nodes;
using AiService.Tools.Registry;

namespace AiService.Tools.Domain;

/// <summary>
/// MCP domain bundles and classification. Ports Python
/// <c>website_profiling.tools.audit_tools.tool_domains</c>.
/// </summary>
public static class McpToolDomains
{
    /// <summary>Named constants for the canonical domain strings, so bare-literal comparisons
    /// elsewhere (e.g. AuditToolSelection.cs, ChatToolSelector.cs) can't drift from this list via typo.</summary>
    public static class Names
    {
        public const string Core = "core";
        public const string Portfolio = "portfolio";
        public const string Issues = "issues";
        public const string Crawl = "crawl";
        public const string Onpage = "onpage";
        public const string Schema = "schema";
        public const string Links = "links";
        public const string Indexation = "indexation";
        public const string Content = "content";
        public const string Keywords = "keywords";
        public const string Google = "google";
        public const string Backlinks = "backlinks";
        public const string Performance = "performance";
        public const string Drift = "drift";
        public const string Security = "security";
        public const string Ops = "ops";
        public const string Export = "export";
        public const string Images = "images";
        public const string Geo = "geo";
        public const string Accessibility = "accessibility";
        public const string Assets = "assets";
        public const string Ctr = "ctr";
        public const string Integrations = "integrations";
        public const string Insight = "insight";
    }

    public static readonly IReadOnlyList<string> CanonicalDomains =
    [
        Names.Core, Names.Portfolio, Names.Issues, Names.Crawl, Names.Onpage, Names.Schema, Names.Links, Names.Indexation,
        Names.Content, Names.Keywords, Names.Google, Names.Backlinks, Names.Performance, Names.Drift, Names.Security,
        Names.Ops, Names.Export, Names.Images, Names.Geo, Names.Accessibility, Names.Assets, Names.Ctr, Names.Integrations, Names.Insight,
    ];

    /// <summary>Chat-only tools excluded from MCP domain bundles.</summary>
    public static readonly HashSet<string> ChatOnlyTools = new(StringComparer.Ordinal)
    {
        "prepare_audit_run",
    };

    /// <summary>Tier 0 router + insight tools always included in the core MCP bundle.</summary>
    public static readonly HashSet<string> Tier0Tools = new(StringComparer.Ordinal)
    {
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
    };

    /// <summary>WP_MCP_DOMAIN env bundles (core, crawl, google, links, full).</summary>
    public static readonly IReadOnlyDictionary<string, HashSet<string>> McpDomainBundles =
        new Dictionary<string, HashSet<string>>(StringComparer.Ordinal)
        {
            ["core"] = new(StringComparer.Ordinal) { "core", "insight" },
            ["crawl"] = new(StringComparer.Ordinal) { "crawl", "onpage", "schema", "accessibility", "assets" },
            ["google"] = new(StringComparer.Ordinal) { "google", "insight", "ctr", "keywords", "integrations" },
            ["links"] = new(StringComparer.Ordinal) { "links", "backlinks", "indexation" },
            ["full"] = new(CanonicalDomains, StringComparer.Ordinal),
        };

    private static readonly Dictionary<string, string> DomainOverrides = new(StringComparer.Ordinal)
    {
        ["search_audit_tools"] = "core",
        ["list_tool_domains"] = "core",
        ["get_data_coverage_report"] = "core",
        ["run_insight_workflow"] = "core",
        ["run_technical_workflow"] = "core",
        ["run_keyword_workflow"] = "core",
        ["run_domain_agent"] = "core",
        ["get_landing_page_blended_table"] = "insight",
        ["get_opportunity_matrix"] = "insight",
        ["get_traffic_health_check"] = "insight",
        ["get_landing_page_full_diagnosis"] = "insight",
        ["get_issue_to_traffic_map"] = "insight",
        ["get_gsc_daily_trend"] = "google",
        ["get_ga4_daily_trend"] = "google",
        ["get_ga4_by_device"] = "google",
        ["get_ga4_by_channel"] = "google",
        ["get_brand_keyword_split"] = "keywords",
        ["list_keywords_by_intent"] = "keywords",
        ["get_gsc_page_queries"] = "google",
        ["prepare_audit_run"] = "ops",
        ["list_broken_links"] = "links",
        ["list_broken_link_sources"] = "links",
        ["get_gsc_sample_links"] = "backlinks",
        ["get_gsc_latest_links"] = "backlinks",
        ["get_gsc_links_summary"] = "backlinks",
        ["get_gsc_links_import_status"] = "backlinks",
        ["list_seo_onpage_issues"] = "onpage",
        ["list_content_url_issues"] = "onpage",
        ["list_pages_missing_title"] = "onpage",
        ["list_pages_missing_h1"] = "onpage",
        ["list_pages_multiple_h1"] = "onpage",
        ["list_pages_missing_meta_description"] = "onpage",
        ["list_pages_meta_desc_too_short"] = "onpage",
        ["list_pages_meta_desc_too_long"] = "onpage",
        ["list_pages_noindex"] = "onpage",
        ["list_pages_missing_canonical"] = "onpage",
        ["list_canonical_mismatch"] = "onpage",
        ["list_pages_with_missing_alt"] = "onpage",
        ["list_pages_skipped_headings"] = "onpage",
        ["list_pages_missing_viewport"] = "onpage",
        ["list_pages_missing_og_image"] = "onpage",
        ["get_report_summary"] = "portfolio",
        ["get_critical_issues"] = "issues",
        ["get_issue_priority_breakdown"] = "issues",
        ["list_top_impact_issues"] = "issues",
        ["prioritize_fix_roadmap"] = "issues",
        ["get_google_summary"] = "google",
        ["get_gsc_ctr_opportunity_pages"] = "ctr",
        ["list_keywords_ctr_opportunity"] = "ctr",
        ["analyze_serp_snippet_for_url"] = "ctr",
        ["compare_reports"] = "drift",
        ["compare_gsc_periods"] = "google",
        ["list_pages_title_too_short"] = "onpage",
        ["list_pages_title_too_long"] = "onpage",
        ["list_pages_slow_response"] = "performance",
        ["list_pages_color_contrast_failures"] = "accessibility",
        ["list_pages_high_reading_level"] = "content",
        ["list_pages_very_thin_content"] = "content",
        ["list_hreflang_issue_pages"] = "indexation",
        ["list_pages_mixed_language"] = "content",
        ["list_misaligned_queries"] = "keywords",
        ["list_referring_domains"] = "backlinks",
        ["get_anchor_text_distribution"] = "backlinks",
        ["list_backlinks_by_anchor_text"] = "backlinks",
        ["list_backlinks_to_url"] = "backlinks",
        ["list_backlinks_from_domain"] = "backlinks",
        ["get_keyword_opportunity_score"] = "keywords",
        ["list_sitemap_urls_not_in_crawl"] = "indexation",
        ["list_crawl_urls_not_in_sitemap"] = "indexation",
        ["list_log_googlebot_low_crawl"] = "ops",
        ["list_redirect_chains_by_length"] = "crawl",
        ["list_compare_new_issues"] = "drift",
        ["list_compare_resolved_issues"] = "drift",
        ["list_compare_lighthouse_regressions"] = "drift",
        ["list_pages_ai_citation_signals"] = "geo",
        ["list_pages_missing_llms_txt_reference"] = "geo",
        ["list_robots_blocked_ai_crawlers"] = "geo",
        ["list_pages_missing_howto_schema"] = "geo",
        ["list_pages_missing_article_schema"] = "geo",
        ["compare_geo_score_deltas"] = "geo",
        ["check_ai_citations_live"] = "geo",
        ["detect_prompt_injection"] = "geo",
        ["get_negative_signals"] = "geo",
        ["get_rag_chunk_readiness"] = "geo",
        ["get_content_decay_signals"] = "geo",
        ["get_multimodal_readiness"] = "geo",
        ["get_topic_authority"] = "geo",
        ["list_gsc_ctr_underperformers"] = "google",
        ["get_sql_schema"] = "core",
        ["run_sql_query"] = "core",
    };

    private static readonly string[] OnpagePrefixes =
    [
        "list_pages_missing_",
        "list_pages_meta_desc_",
        "list_pages_multiple_h1",
        "list_pages_noindex",
        "list_seo_onpage",
        "list_content_url",
    ];

    public static string ResolveMcpDomain()
    {
        var raw = Environment.GetEnvironmentVariable("WP_MCP_DOMAIN");
        var key = (raw ?? "core").Trim().ToLowerInvariant();
        return McpDomainBundles.ContainsKey(key) ? key : "core";
    }

    public static string ClassifyToolDomain(string name)
    {
        if (DomainOverrides.TryGetValue(name, out var domain))
        {
            return domain;
        }

        if (name.StartsWith("compare_", StringComparison.Ordinal))
        {
            return "drift";
        }

        if (name.StartsWith("list_compare_", StringComparison.Ordinal))
        {
            return "drift";
        }

        if (Tier0Tools.Contains(name))
        {
            return DomainOverrides.GetValueOrDefault(name, "core");
        }

        if (name.StartsWith("export_", StringComparison.Ordinal) || name == "list_export_formats")
        {
            return "export";
        }

        if (name.StartsWith("get_image_", StringComparison.Ordinal)
            || name is "list_pages_without_lazy" or "list_pages_with_images_missing"
            or "list_site_image" or "list_lighthouse_image" or "list_largest_images"
            or "list_unoptimized_images" or "list_images_needing")
        {
            return "images";
        }

        if (name.StartsWith("get_landing_page_", StringComparison.Ordinal)
            || name.StartsWith("get_opportunity_", StringComparison.Ordinal)
            || name.StartsWith("get_traffic_health", StringComparison.Ordinal)
            || name.StartsWith("get_issue_to_traffic", StringComparison.Ordinal))
        {
            return "insight";
        }

        if (name.StartsWith("get_geo_", StringComparison.Ordinal)
            || name.StartsWith("get_aeo_", StringComparison.Ordinal)
            || name.StartsWith("get_llms_", StringComparison.Ordinal)
            || name.StartsWith("get_eeat_", StringComparison.Ordinal)
            || name.StartsWith("get_faq_", StringComparison.Ordinal)
            || name.StartsWith("get_ai_discovery", StringComparison.Ordinal)
            || name.StartsWith("get_robots_ai_", StringComparison.Ordinal)
            || name.StartsWith("get_citability_", StringComparison.Ordinal)
            || name is "list_pages_missing_faq" or "draft_llms" or "check_ai_citation"
            or "generate_schema" or "generate_robots_txt" or "generate_meta_tags" or "generate_geo_fix"
            || name.StartsWith("get_agent_", StringComparison.Ordinal)
            || name.StartsWith("get_agents_", StringComparison.Ordinal)
            || name is "get_skill_md" or "get_token_budget"
            or "get_copy_for_ai" or "get_markdown_availability" or "get_content_structure_aeo"
            or "list_oversized_pages" or "list_pages_agent_unfriendly"
            or "list_pages_missing_copy_for_ai" or "generate_agent_readiness")
        {
            return "geo";
        }

        if (name.Contains("axe", StringComparison.Ordinal)
            || name.Contains("mixed_content", StringComparison.Ordinal)
            || name == "get_heading_outline_for_url")
        {
            return "accessibility";
        }

        if (name is "get_asset_weight_summary" or "get_readability_summary" or "list_heavy_pages_by_bytes"
            or "list_pages_poor_cache_headers" or "list_pages_low_content_ratio")
        {
            return "assets";
        }

        if (name.Contains("ctr", StringComparison.Ordinal)
            || name is "list_keywords_ctr_opportunity" or "analyze_serp_snippet_for_url")
        {
            return "ctr";
        }

        if (name is "get_gsc_url_inspection" or "get_gsc_index_coverage" or "get_bing_index_status"
            or "get_serp_feature_overlay")
        {
            return "integrations";
        }

        if (OnpagePrefixes.Any(p => name.StartsWith(p, StringComparison.Ordinal)))
        {
            return "onpage";
        }

        if (name.StartsWith("list_propert", StringComparison.Ordinal)
            || name.StartsWith("get_propert", StringComparison.Ordinal)
            || name.StartsWith("get_report", StringComparison.Ordinal)
            || name.StartsWith("get_executive", StringComparison.Ordinal)
            || name.StartsWith("get_site", StringComparison.Ordinal)
            || name.StartsWith("list_report", StringComparison.Ordinal)
            || name.StartsWith("get_portfolio", StringComparison.Ordinal)
            || name is "get_ads_txt_status" or "get_security_txt_status" or "get_contact_intelligence"
            or "get_rich_results_summary" or "list_rich_results_failures" or "get_competitor_keyword_gap"
            or "get_pagination_audit_summary" or "get_portfolio_benchmark")
        {
            return "portfolio";
        }

        if (name is "list_top_impact_issues" or "prioritize_fix_roadmap" or "generate_issue_fix"
            or "summarize_category_for_client"
            || name.Contains("issue", StringComparison.Ordinal)
            || name.Contains("category", StringComparison.Ordinal)
            || name.Contains("workflow", StringComparison.Ordinal))
        {
            return "issues";
        }

        if (name.StartsWith("list_pages_", StringComparison.Ordinal)
            || name.StartsWith("list_canonical", StringComparison.Ordinal)
            || name.StartsWith("list_long_", StringComparison.Ordinal)
            || name.StartsWith("list_robots_", StringComparison.Ordinal)
            || name.StartsWith("get_top_pages_by", StringComparison.Ordinal)
            || name.StartsWith("search_pages", StringComparison.Ordinal)
            || name.StartsWith("get_page_", StringComparison.Ordinal)
            || name.StartsWith("list_redirects", StringComparison.Ordinal)
            || name.StartsWith("list_broken", StringComparison.Ordinal)
            || name.StartsWith("list_status_", StringComparison.Ordinal)
            || name.StartsWith("get_status_code", StringComparison.Ordinal)
            || name.StartsWith("get_response_time", StringComparison.Ordinal)
            || name.StartsWith("get_depth", StringComparison.Ordinal)
            || name.StartsWith("get_crawl_", StringComparison.Ordinal)
            || name.StartsWith("get_browser", StringComparison.Ordinal)
            || name.StartsWith("list_pages_with", StringComparison.Ordinal)
            || name.StartsWith("list_pages_by", StringComparison.Ordinal)
            || name.StartsWith("list_pages_soft", StringComparison.Ordinal)
            || name.StartsWith("list_pages_poor", StringComparison.Ordinal)
            || name.StartsWith("list_dead_end", StringComparison.Ordinal)
            || name.StartsWith("list_duplicate_title", StringComparison.Ordinal)
            || name.StartsWith("list_heavy_pages", StringComparison.Ordinal))
        {
            return "crawl";
        }

        if (name.Contains("schema", StringComparison.Ordinal) || name == "get_seo_health")
        {
            return "schema";
        }

        if (name.Contains("orphan", StringComparison.Ordinal)
            || name.Contains("link", StringComparison.Ordinal)
            || name.Contains("fingerprint", StringComparison.Ordinal)
            || name.Contains("pagerank", StringComparison.Ordinal))
        {
            return "links";
        }

        if (name.Contains("indexation", StringComparison.Ordinal)
            || name.Contains("hreflang", StringComparison.Ordinal)
            || name.Contains("language", StringComparison.Ordinal)
            || name == "list_subdomains")
        {
            return "indexation";
        }

        if (name.Contains("content", StringComparison.Ordinal)
            || name.Contains("social", StringComparison.Ordinal)
            || name.Contains("ner", StringComparison.Ordinal)
            || name.Contains("thin", StringComparison.Ordinal)
            || name.Contains("opportunit", StringComparison.Ordinal)
            || name.Contains("duplicate", StringComparison.Ordinal))
        {
            return "content";
        }

        if (name.Contains("keyword", StringComparison.Ordinal)
            || name.Contains("cannibal", StringComparison.Ordinal)
            || name.Contains("misalignment", StringComparison.Ordinal)
            || name.Contains("striking", StringComparison.Ordinal)
            || name.Contains("semantic", StringComparison.Ordinal)
            || name is "expand_keywords" or "generate_content_brief")
        {
            return "keywords";
        }

        if (name.Contains("google", StringComparison.Ordinal)
            || name.Contains("gsc", StringComparison.Ordinal)
            || name.Contains("ga4", StringComparison.Ordinal))
        {
            return "google";
        }

        if (name.Contains("backlink", StringComparison.Ordinal)
            || name.Contains("competitor", StringComparison.Ordinal)
            || name.Contains("bing", StringComparison.Ordinal)
            || name.Contains("gsc_links", StringComparison.Ordinal))
        {
            return "backlinks";
        }

        if (name.Contains("lighthouse", StringComparison.Ordinal)
            || name.Contains("crux", StringComparison.Ordinal)
            || name.Contains("slow", StringComparison.Ordinal)
            || name.Contains("cwv", StringComparison.Ordinal))
        {
            return "performance";
        }

        if (name.Contains("health", StringComparison.Ordinal)
            || name.Contains("compare", StringComparison.Ordinal)
            || name.Contains("alert", StringComparison.Ordinal)
            || name.Contains("tech_stack", StringComparison.Ordinal)
            || name == "list_pages_by_technology")
        {
            return "drift";
        }

        if (name.Contains("security", StringComparison.Ordinal))
        {
            return "security";
        }

        if (name.Contains("log", StringComparison.Ordinal)
            || name is "get_property_ops" or "list_crawl_runs" or "list_log_uploads" or "get_page_coach")
        {
            return "ops";
        }

        return "portfolio";
    }

    public static HashSet<string> ToolNamesForMcpBundle(IEnumerable<string> allToolNames, string? bundle = null)
    {
        var bundleKey = (bundle ?? ResolveMcpDomain()).Trim().ToLowerInvariant();
        if (!McpDomainBundles.TryGetValue(bundleKey, out var allowedDomains))
        {
            allowedDomains = McpDomainBundles["core"];
            bundleKey = "core";
        }

        var allNames = allToolNames.ToHashSet(StringComparer.Ordinal);
        if (bundleKey == "full")
        {
            allNames.ExceptWith(ChatOnlyTools);
            return allNames;
        }

        var byDomain = ToolsByDomain(allNames);
        var names = new HashSet<string>(StringComparer.Ordinal);
        foreach (var domain in allowedDomains)
        {
            if (byDomain.TryGetValue(domain, out var domainTools))
            {
                names.UnionWith(domainTools);
            }
        }

        if (bundleKey == "core")
        {
            names.UnionWith(Tier0Tools.Where(allNames.Contains));
        }

        names.ExceptWith(ChatOnlyTools);
        return names;
    }

    /// <summary>Tools in explicitly enabled canonical domains (custom bundle mode).</summary>
    public static HashSet<string> ToolNamesForEnabledDomains(
        IEnumerable<string> allToolNames,
        IEnumerable<string> enabledDomains)
    {
        var allowedDomains = enabledDomains
            .Select(d => d.Trim().ToLowerInvariant())
            .Where(CanonicalDomains.Contains)
            .ToHashSet(StringComparer.Ordinal);

        if (allowedDomains.Count == 0)
        {
            allowedDomains.UnionWith([Names.Core, Names.Insight]);
        }

        var allNames = allToolNames.ToHashSet(StringComparer.Ordinal);
        var byDomain = ToolsByDomain(allNames);
        var names = new HashSet<string>(StringComparer.Ordinal);

        foreach (var domain in allowedDomains)
        {
            if (byDomain.TryGetValue(domain, out var domainTools))
            {
                names.UnionWith(domainTools);
            }
        }

        if (allowedDomains.Contains("core"))
        {
            names.UnionWith(Tier0Tools.Where(allNames.Contains));
        }

        names.ExceptWith(ChatOnlyTools);
        return names;
    }

    private static Dictionary<string, List<string>> ToolsByDomain(IEnumerable<string> toolNames)
    {
        var outMap = CanonicalDomains.ToDictionary(d => d, _ => new List<string>(), StringComparer.Ordinal);
        foreach (var name in toolNames)
        {
            var domain = ClassifyToolDomain(name);
            if (!outMap.TryGetValue(domain, out var list))
            {
                list = [];
                outMap[domain] = list;
            }

            list.Add(name);
        }

        foreach (var list in outMap.Values)
        {
            list.Sort(StringComparer.Ordinal);
        }

        return outMap;
    }

    public static long? DefaultPropertyId()
    {
        var raw = Environment.GetEnvironmentVariable("WP_PROPERTY_ID")?.Trim();
        if (string.IsNullOrEmpty(raw))
        {
            return null;
        }

        return long.TryParse(raw, out var pid) && pid > 0 ? pid : null;
    }

    public static Dictionary<string, List<string>> GroupToolsByDomain(IEnumerable<string> toolNames)
    {
        var byDomain = CanonicalDomains.ToDictionary(d => d, _ => new List<string>(), StringComparer.Ordinal);
        foreach (var name in toolNames)
        {
            var domain = ClassifyToolDomain(name);
            if (!byDomain.TryGetValue(domain, out var list))
            {
                list = [];
                byDomain[domain] = list;
            }

            list.Add(name);
        }

        return byDomain;
    }

    public static readonly IReadOnlyDictionary<string, string> DomainExamplePrompts =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["core"] = "Search tools or run an insight workflow",
            ["portfolio"] = "Summarize portfolio health across properties",
            ["issues"] = "List critical issues sorted by traffic impact",
            ["crawl"] = "Find crawl errors and status code breakdowns",
            ["google"] = "Summarize GSC and GA4 performance",
            ["insight"] = "Show landing page opportunity matrix",
            ["links"] = "List broken internal links",
            ["keywords"] = "Find striking-distance keywords",
            ["export"] = "Export audit as PDF or Excel",
            ["geo"] = "Check AI citation readiness",
        };

    public static JsonObject BuildListToolsPayload(
        IReadOnlyCollection<string> exposedNames,
        ToolCatalogEntryLookup catalog,
        string mcpDomain)
    {
        var tools = new JsonArray();
        foreach (var name in exposedNames.Order(StringComparer.Ordinal))
        {
            if (!catalog.TryGetEntry(name, out var entry))
            {
                continue;
            }

            tools.Add(new JsonObject
            {
                ["name"] = name,
                ["description"] = entry.Description,
                ["domain"] = ClassifyToolDomain(name),
                ["inputSchema"] = entry.InputSchema?.DeepClone(),
            });
        }

        return new JsonObject
        {
            ["mcp_domain"] = mcpDomain,
            ["tool_count"] = tools.Count,
            ["available_mcp_domains"] = new JsonArray(McpDomainBundles.Keys.Order(StringComparer.Ordinal).Select(k => JsonValue.Create(k)).ToArray()),
            ["tools"] = tools,
        };
    }
}
