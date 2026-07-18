using System.Text;
using System.Text.Json.Nodes;
using AiService.Tools.Artifacts;
using AiService.Tools.Bridge;
using AiService.Tools.Context;
using AiService.Tools.Registry;
using AiService.Tools.Slice;
using Microsoft.EntityFrameworkCore;
using WebsiteProfiling.Contracts.Json;

using AiService.Tools.Persistence;
namespace AiService.Tools.Handlers.Export;

/// <summary>Export and deliverable tools — ports Python <c>export/export_tools.py</c> and
/// <c>export/export_extras.py</c>.</summary>
public static class ExportToolHandlers
{
    private static readonly HashSet<string> ExportFormats = ["pdf", "csv", "json"];

    private static readonly HashSet<string> ListExportAllowlist =
    [
        "list_issues", "search_issues", "list_issues_by_category", "list_issues_with_ai_fixes",
        "list_seo_onpage_issues", "list_content_url_issues", "list_pages_missing_title",
        "list_pages_missing_h1", "list_pages_multiple_h1", "list_pages_missing_meta_description",
        "list_pages_meta_desc_too_short", "list_pages_meta_desc_too_long", "list_pages_noindex",
        "list_redirects", "list_broken_links", "list_broken_link_sources", "list_status_4xx_pages",
        "list_status_5xx_pages", "list_orphan_pages", "list_thin_content_pages",
        "list_pages_missing_canonical", "list_canonical_mismatch", "list_pages_with_missing_alt",
        "list_pages_without_lazy_images", "list_pages_with_images_missing_dimensions",
        "list_site_image_urls", "list_largest_images", "list_unoptimized_images",
        "list_images_needing_attention", "list_pages_skipped_headings", "list_pages_missing_viewport",
        "list_long_redirect_chains", "list_robots_blocked_urls", "list_pages_missing_og_image",
        "list_pages_by_technology", "list_pages_with_console_errors", "list_pages_by_fetch_method",
        "list_security_findings_by_type", "list_indexation_gaps", "list_keywords_by_action",
        "list_keywords_by_position", "list_keywords_by_impressions", "list_lighthouse_poor_seo_pages",
        "list_lighthouse_poor_accessibility_pages", "list_lighthouse_poor_best_practices_pages",
        "list_lighthouse_cwv_failures", "list_slow_pages", "list_log_only_paths",
        "list_crawl_only_paths", "compare_issue_deltas", "compare_redirect_deltas",
        "compare_lighthouse_deltas", "get_log_top_paths", "get_top_pages_by_pagerank",
        "get_top_crawled_pages", "get_top_linked_pages", "search_pages", "search_pages_advanced",
        "search_keywords", "search_pages_by_schema_type", "list_pages_without_schema",
        "list_pages_title_too_short", "list_pages_title_too_long", "list_pages_slow_response",
        "list_pages_missing_html_lang", "list_pages_invalid_viewport",
        "list_pages_color_contrast_failures", "list_pages_high_reading_level",
        "list_pages_very_thin_content", "list_hreflang_issue_pages", "list_pages_missing_og_tags",
        "list_pages_missing_twitter_cards", "list_pages_invalid_json_ld", "list_pages_mixed_language",
        "list_orphan_hub_suggestions", "list_lighthouse_failure_lcp", "list_lighthouse_failure_inp",
        "list_lighthouse_failure_cls", "list_lighthouse_failure_seo",
        "list_pages_console_errors_by_type", "list_pages_js_rendering_delta",
        "list_gsc_pages_by_impressions", "list_gsc_pages_by_clicks", "list_gsc_queries_by_impressions",
        "list_gsc_queries_by_clicks", "list_gsc_ctr_underperformers", "list_gsc_decaying_pages",
        "list_gsc_decaying_queries", "list_gsc_new_queries", "list_ga4_landing_pages",
        "list_ga4_pages_by_bounce_rate", "list_ga4_pages_by_engagement_rate",
        "list_gsc_ga4_mismatch_pages", "list_gsc_pages_by_position_band", "list_gsc_branded_queries",
        "list_gsc_non_branded_queries", "list_keyword_rank_improvements", "list_keyword_rank_declines",
        "list_keywords_new_to_top_10", "list_keywords_fell_out_of_top_10",
        "list_cannibalisation_queries", "list_cannibalisation_urls", "list_misaligned_queries",
        "list_keywords_by_recommended_action", "list_keywords_by_serp_feature",
        "list_semantic_cluster_pages", "list_semantic_cluster_queries", "list_keywords_near_page_one",
        "list_keywords_high_impression_zero_click", "list_keywords_by_competition_band",
        "list_keywords_with_ai_overview", "list_keywords_local_pack", "list_keywords_question_intent",
        "list_keywords_commercial_intent", "list_referring_domains", "list_backlinks_by_anchor_text",
        "list_backlinks_to_url", "list_backlinks_from_domain", "list_outbound_links",
        "list_internal_links_from_url", "list_internal_links_to_url", "list_links_by_rel_nofollow",
        "list_pagerank_low_pages", "list_indexation_submitted_not_indexed",
        "list_indexation_indexed_not_submitted", "list_sitemap_urls_not_in_crawl",
        "list_crawl_urls_not_in_sitemap", "list_log_paths_by_hits", "list_log_5xx_paths",
        "list_log_googlebot_low_crawl", "list_log_orphan_high_traffic",
        "list_redirect_chains_by_length", "list_hreflang_reciprocal_gaps",
        "list_pages_containing_keyword", "list_pages_by_word_count_band",
        "list_duplicate_content_pairs", "list_spell_check_issues", "list_html_validation_issues",
        "list_amp_validation_issues", "list_pagination_issues", "list_schema_errors_by_type",
        "list_pages_missing_article_schema", "list_pages_missing_howto_schema",
        "list_pages_ai_citation_signals", "list_pages_missing_llms_txt_reference",
        "list_robots_blocked_ai_crawlers", "list_compare_new_issues", "list_compare_resolved_issues",
        "list_compare_new_urls", "list_compare_removed_urls", "list_compare_lighthouse_regressions",
        "list_compare_traffic_losers",
    ];

    public static async Task<JsonObject> ExportAuditReportAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        DataServiceClient dataService,
        CancellationToken cancellationToken)
    {
        var format = (JsonCoercion.AsString(args["format"]) ?? "pdf").Trim().ToLowerInvariant();
        if (!ExportFormats.Contains(format))
        {
            return new JsonObject { ["error"] = $"format must be one of: {string.Join(", ", ExportFormats.OrderBy(f => f))}" };
        }

        var scoped = ctx.WithArgs(args);
        var reportId = scoped.ReportId;
        if (reportId is null && scoped.PropertyId is long propertyId)
        {
            reportId = await AuditReportResolver.ResolveLatestReportIdAsync(db, propertyId, cancellationToken);
        }
        else if (reportId is null)
        {
            reportId = await db.ReportPayloads.AsNoTracking()
                .OrderByDescending(x => x.Id)
                .Select(x => (long?)x.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (reportId is null)
        {
            return new JsonObject { ["error"] = "no report found" };
        }

        var profile = (JsonCoercion.AsString(args["profile"]) ?? "standard").Trim().ToLowerInvariant();
        var extra = new JsonObject { ["format"] = format, ["report_id"] = reportId };

        JsonObject artifact;
        if (format == "pdf")
        {
            var bytes = await dataService.GetPdfAsync(reportId.Value, profile, cancellationToken);
            if (bytes is null)
            {
                return new JsonObject { ["error"] = "no report found" };
            }

            artifact = ArtifactStore.SaveArtifact(bytes, "audit-export.pdf", "application/pdf", extra);
        }
        else if (format == "csv")
        {
            var csv = await dataService.GetCsvAsync(reportId.Value, cancellationToken);
            if (csv is null)
            {
                return new JsonObject { ["error"] = "no report found" };
            }

            artifact = ArtifactStore.SaveArtifact(csv, "audit-export.csv", "text/csv; charset=utf-8", extra);
        }
        else
        {
            var json = await dataService.GetJsonAsync(reportId.Value, cancellationToken);
            if (json is null)
            {
                return new JsonObject { ["error"] = "no report found" };
            }

            artifact = ArtifactStore.SaveArtifact(json, "audit-export.json", "application/json; charset=utf-8", extra);
        }

        artifact["format"] = format;
        artifact["report_id"] = reportId;
        return artifact;
    }

    public static async Task<JsonObject> ExportListAsCsvAsync(
        AuditToolContext ctx,
        JsonObject args,
        ToolDispatcher dispatcher,
        CancellationToken cancellationToken)
    {
        var toolName = (JsonCoercion.AsString(args["tool_name"]) ?? "").Trim();
        if (toolName.Length == 0)
        {
            return new JsonObject { ["error"] = "tool_name is required" };
        }

        if (!ListExportAllowlist.Contains(toolName))
        {
            return new JsonObject { ["error"] = $"tool_name not allowed for CSV export: {toolName}" };
        }

        JsonObject toolArgs = args["tool_args"] is JsonObject ta ? (JsonObject)ta.DeepClone() : new JsonObject();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 100, 500);
        toolArgs["limit"] = limit;

        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is long propertyId && toolArgs["property_id"] is null)
        {
            toolArgs["property_id"] = propertyId;
        }

        if (scoped.ReportId is long reportId && toolArgs["report_id"] is null)
        {
            toolArgs["report_id"] = reportId;
        }

        var result = await dispatcher.DispatchAsync(toolName, scoped, toolArgs, cancellationToken);
        if (result.TryGetPropertyValue("error", out var error) && JsonCoercion.IsTruthy(error))
        {
            return result;
        }

        var rows = ArtifactStore.RowsFromToolResult(result);
        if (rows.Count == 0)
        {
            return new JsonObject { ["error"] = "tool returned no exportable rows", ["tool_name"] = toolName };
        }

        List<string>? columns = null;
        if (args["columns"] is JsonArray columnsArray)
        {
            columns = columnsArray
                .Select(c => JsonCoercion.AsString(c))
                .Where(c => !string.IsNullOrEmpty(c))
                .Select(c => c!)
                .ToList();
        }

        var csvText = ArtifactStore.DictsToCsv(rows, columns);
        var filename = $"{toolName}.csv";
        var artifact = ArtifactStore.SaveArtifact(
            csvText,
            filename,
            "text/csv; charset=utf-8",
            new JsonObject { ["tool_name"] = toolName, ["row_total"] = rows.Count });
        artifact["tool_name"] = toolName;
        artifact["total"] = rows.Count;
        artifact["format"] = "csv";
        return artifact;
    }

    public static async Task<JsonObject> ExportSitemapXmlAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "report not found" };
        }

        var xml = BuildSitemapXml(payload);
        var artifact = ArtifactStore.SaveArtifact(xml, "sitemap.xml", "application/xml");
        artifact["url_count"] = CountOccurrences(xml, "<loc>");
        return artifact;
    }

    private static string BuildSitemapXml(JsonObject payload, int maxUrls = 50000)
    {
        var urls = new List<string>();
        if (payload["links"] is JsonArray links)
        {
            foreach (var node in links)
            {
                if (node is not JsonObject row)
                {
                    continue;
                }

                if (JsonCoercion.IsTruthy(row["noindex"]))
                {
                    continue;
                }

                var status = JsonCoercion.AsString(row["status"]) ?? "";
                if (!status.StartsWith('2'))
                {
                    continue;
                }

                var url = (JsonCoercion.AsString(row["url"]) ?? "").Trim();
                if (url.Length > 0)
                {
                    urls.Add(url);
                }
            }
        }

        if (urls.Count > maxUrls)
        {
            urls = urls.Take(Math.Max(1, maxUrls)).ToList();
        }

        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.Append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        foreach (var url in urls)
        {
            sb.Append("  <url><loc>").Append(XmlEscape(url)).Append("</loc></url>\n");
        }

        sb.Append("</urlset>\n");
        return sb.ToString();
    }

    private static string XmlEscape(string value)
    {
        var sb = new StringBuilder(value.Length);
        foreach (var c in value)
        {
            sb.Append(c switch
            {
                '&' => "&amp;",
                '<' => "&lt;",
                '>' => "&gt;",
                _ => c.ToString(),
            });
        }

        return sb.ToString();
    }

    private static int CountOccurrences(string haystack, string needle)
    {
        var count = 0;
        var index = 0;
        while ((index = haystack.IndexOf(needle, index, StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += needle.Length;
        }

        return count;
    }

    public static async Task<JsonObject> ExportCompareCsvAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var (current, baseline, currentReportId, baselineReportId, error) =
            await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return new JsonObject { ["error"] = error };
        }

        var csv = ExportCompareIssuesCsv(current!, baseline!);
        var filename = $"audit-compare-{currentReportId}-vs-{baselineReportId}.csv";
        var artifact = ArtifactStore.SaveArtifact(
            csv,
            filename,
            "text/csv; charset=utf-8",
            new JsonObject { ["baseline_report_id"] = baselineReportId, ["report_id"] = currentReportId });
        artifact["current_report_id"] = currentReportId;
        artifact["baseline_report_id"] = baselineReportId;
        artifact["format"] = "csv";
        return artifact;
    }

    private static string ExportCompareIssuesCsv(JsonObject current, JsonObject baseline)
    {
        var issuesA = CollectIssues(current);
        var issuesB = CollectIssues(baseline);
        var sb = new StringBuilder();
        sb.Append("change,category,priority,url,message,recommendation\r\n");
        foreach (var (key, (category, issue)) in issuesA)
        {
            if (!issuesB.ContainsKey(key))
            {
                AppendCompareRow(sb, "removed", category, issue);
            }
        }

        foreach (var (key, (category, issue)) in issuesB)
        {
            if (!issuesA.ContainsKey(key))
            {
                AppendCompareRow(sb, "added", category, issue);
            }
        }

        return sb.ToString();
    }

    private static void AppendCompareRow(StringBuilder sb, string change, string category, JsonObject issue)
    {
        var fields = new[]
        {
            change,
            category,
            JsonCoercion.AsString(issue["priority"]) ?? "",
            JsonCoercion.AsString(issue["url"]) ?? "",
            JsonCoercion.AsString(issue["message"]) ?? "",
            JsonCoercion.AsString(issue["recommendation"]) ?? "",
        };
        sb.Append(string.Join(",", fields.Select(ArtifactStore.CsvEscape)));
        sb.Append("\r\n");
    }

    private static Dictionary<string, (string Category, JsonObject Issue)> CollectIssues(JsonObject payload)
    {
        var result = new Dictionary<string, (string, JsonObject)>();
        if (payload["categories"] is not JsonArray categories)
        {
            return result;
        }

        foreach (var catNode in categories)
        {
            if (catNode is not JsonObject cat)
            {
                continue;
            }

            var name = JsonCoercion.AsString(cat["name"]) ?? JsonCoercion.AsString(cat["id"]) ?? "";
            if (cat["issues"] is not JsonArray issues)
            {
                continue;
            }

            foreach (var issueNode in issues)
            {
                if (issueNode is not JsonObject issue)
                {
                    continue;
                }

                var url = JsonCoercion.AsString(issue["url"]) ?? "";
                var message = JsonCoercion.AsString(issue["message"]) ?? "";
                result[$"{name}|{url}|{message}"] = (name, issue);
            }
        }

        return result;
    }

    public static Task<JsonObject> ListExportFormatsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var result = new JsonObject
        {
            ["formats"] = new JsonArray(
                new JsonObject { ["tool"] = "export_audit_report", ["format"] = "pdf", ["description"] = "Full audit PDF deliverable (Data service)" },
                new JsonObject { ["tool"] = "export_audit_report", ["format"] = "csv", ["description"] = "Full audit CSV (URLs + issues)" },
                new JsonObject { ["tool"] = "export_audit_report", ["format"] = "json", ["description"] = "Full audit JSON payload" },
                new JsonObject { ["tool"] = "export_compare_csv", ["format"] = "csv", ["description"] = "Issue added/removed diff between two reports" },
                new JsonObject { ["tool"] = "export_list_as_csv", ["format"] = "csv", ["description"] = "CSV from any allowlisted list tool result" }),
            ["example_prompts"] = new JsonArray(
                "Download the audit as PDF",
                "Export broken links as CSV",
                "Compare this report to report 38 as CSV"),
            ["notes"] = new JsonArray(
                "PDF requires the Data service (DATA_SERVICE_URL; see services/Data/)",
                "Artifacts expire after 24 hours",
                "Chat UI shows download buttons after export tools run"),
        };

        return Task.FromResult(result);
    }
}
