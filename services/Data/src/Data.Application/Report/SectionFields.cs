namespace Data.Application.Report;

/// <summary>
/// Port of <c>SECTION_FIELDS</c> from <c>report_loader.py</c>.
/// Maps section key → the subset of top-level JSON fields the client wants.
/// </summary>
public static class SectionFields
{
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> ByKey =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            ["core"] =
            [
                "site_name", "summary", "categories", "top_pages", "recommendations",
                "seo_health", "social_coverage", "status_counts", "portfolio_benchmark",
                "executive_summary", "crux_summary", "report_meta", "report_generated_at",
                "crawl_only_preview", "crawl_run_id", "crawl_run_created_at", "site_level",
                "ml_errors",
            ],
            ["links"] =
            [
                "links", "link_edges", "link_rel_summary", "inlink_anchor_matrix",
                "outbound_link_domains", "outlink_labels", "outlink_counts",
            ],
            ["traffic"] = ["google"],
            ["gsc-detail"] = [],
            ["keywords"] =
            [
                "keywords", "keyword_opportunities", "competitor_keyword_gap",
                "semantic_keyword_clusters",
            ],
            ["issues"] = ["issues", "redirects"],
            ["content"] =
            [
                "content_urls", "content_duplicates", "content_analytics",
                "text_content_analysis", "response_time_stats",
            ],
            ["lighthouse"] =
            [
                "lighthouse_summary", "lighthouse_by_url", "lighthouse_diagnostics",
                "lighthouse_human_summary",
            ],
            ["security"] = ["security_findings"],
            ["gsc-links"] = ["gsc_links", "bing_backlinks", "competitor_link_gap"],
            ["structure"] = ["graph_nodes", "graph_edges", "depth_distribution"],
            ["tech"] = ["tech_stack_summary", "subdomains", "contact_intelligence"],
            ["indexation"] =
            [
                "indexation_coverage", "hreflang_summary", "ner_site_summary",
                "language_summary", "rich_results_validation", "url_fingerprints",
                "rich_results_meta",
            ],
            ["gallery"] =
            [
                "mime_labels", "mime_values", "title_labels", "title_counts",
                "domain_labels", "domain_values",
            ],
        };

    public static readonly IReadOnlySet<string> ValidKeys =
        new HashSet<string>(ByKey.Keys, StringComparer.Ordinal);
}
