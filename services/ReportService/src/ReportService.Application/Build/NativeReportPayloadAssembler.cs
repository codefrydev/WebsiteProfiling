using System.Text.Json;
using System.Text.Json.Nodes;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Assembles native report payload sections ported from Python reporting/builder.py.</summary>
public static class NativeReportPayloadAssembler
{
    public static Dictionary<string, object?> AssembleFull(
        NativeReportSlice slice,
        string? siteName = null,
        string? reportTitle = null,
        long? propertyId = null,
        long? crawlRunId = null,
        string? crawlRunCreatedAt = null,
        IReadOnlyDictionary<string, object?>? siteLevel = null,
        IReadOnlyDictionary<string, object?>? mlBundle = null)
    {
        var payload = AssembleCore(slice, siteName, reportTitle, siteLevel, mlBundle);

        payload["status_counts"] = slice.ChartData.StatusCounts;
        payload["mime_labels"] = slice.ChartData.MimeLabels;
        payload["mime_values"] = slice.ChartData.MimeValues;
        payload["outlink_labels"] = slice.ChartData.OutlinkLabels;
        payload["outlink_counts"] = slice.ChartData.OutlinkCounts;
        payload["title_labels"] = slice.ChartData.TitleLabels;
        payload["title_counts"] = slice.ChartData.TitleCounts;
        payload["domain_labels"] = slice.ChartData.DomainLabels;
        payload["domain_values"] = slice.ChartData.DomainValues;
        payload["graph_nodes"] = slice.Graph.GraphNodes;
        payload["graph_edges"] = slice.Graph.GraphEdges;
        payload["top_pages"] = slice.Graph.TopPages;
        payload["text_content_analysis"] = slice.TextContentAnalysis;
        payload["social_coverage"] = slice.SocialCoverage;
        payload["tech_stack_summary"] = slice.TechStackSummary;
        payload["hreflang_issue_urls"] = slice.HreflangIssueUrls;
        if (slice.LinkEdges.Count > 0)
        {
            payload["link_edges"] = slice.LinkEdges;
            payload["link_rel_summary"] = slice.LinkRelSummary;
            payload["inlink_anchor_matrix"] = slice.InlinkAnchorMatrix;
        }

        if (slice.GoogleData is not null)
        {
            payload["google"] = slice.GoogleData;
        }

        if (slice.KeywordsData is not null)
        {
            payload["keywords"] = slice.KeywordsData;
        }

        if (slice.GscLinksData is not null)
        {
            payload["gsc_links"] = slice.GscLinksData;
        }

        if (slice.IndexationCoverage is not null)
        {
            payload["indexation_coverage"] = slice.IndexationCoverage;
        }

        if (slice.CompetitorLinkGap is not null)
        {
            payload["competitor_link_gap"] = slice.CompetitorLinkGap;
        }

        payload["security_findings"] = slice.SecurityFindings ?? [];
        payload["keyword_opportunities"] = new Dictionary<string, object?>();
        payload["semantic_keyword_clusters"] = Array.Empty<object>();
        payload["image_inventory"] = Array.Empty<object>();
        payload["image_inventory_summary"] = new Dictionary<string, object?>
        {
            ["probed"] = 0,
            ["failed"] = 0,
            ["total_bytes"] = 0,
            ["over_threshold_count"] = 0,
            ["unoptimized_min_kb"] = 200,
            ["inventory_available"] = false,
        };
        payload["optional_audit_urls"] = new Dictionary<string, object?>
        {
            ["spell"] = Array.Empty<object>(),
            ["html"] = Array.Empty<object>(),
            ["amp"] = Array.Empty<object>(),
            ["pagination"] = Array.Empty<object>(),
        };
        payload["lighthouse_failure_urls"] = new Dictionary<string, object?>
        {
            ["lcp"] = Array.Empty<object>(),
            ["inp"] = Array.Empty<object>(),
            ["cls"] = Array.Empty<object>(),
            ["seo"] = Array.Empty<object>(),
        };
        payload["contact_intelligence"] = new Dictionary<string, object?>();
        payload["lighthouse_by_url"] = SerializeLighthouseByUrl(slice.LighthouseByUrl);

        if (slice.LighthouseSummary is not null)
        {
            payload["lighthouse_summary"] = slice.LighthouseSummary;
            payload["lighthouse_diagnostics"] = LighthouseJsonHelper.ExtractList(slice.LighthouseSummary, "diagnostics");
            payload["lighthouse_human_summary"] = LighthouseJsonHelper.ExtractHumanSummary(slice.LighthouseSummary);
        }

        payload["content_duplicates"] = Array.Empty<object>();
        payload["language_summary"] = new Dictionary<string, object?>();
        payload["ml_errors"] = Array.Empty<object>();

        if (propertyId is not null)
        {
            payload["property_id"] = propertyId;
        }

        if (crawlRunId is not null)
        {
            payload["crawl_run_id"] = crawlRunId;
        }

        if (!string.IsNullOrWhiteSpace(crawlRunCreatedAt))
        {
            payload["crawl_run_created_at"] = crawlRunCreatedAt;
        }

        payload["native_build"] = new Dictionary<string, object?>
        {
            ["partial"] = false,
            ["native"] = true,
            ["crawl_row_count"] = slice.CrawlRowCount,
            ["edge_count"] = slice.Edges.Count,
            ["category_count"] = slice.Categories.Count,
            ["lighthouse_url_count"] = slice.LighthouseByUrl.Count,
            ["link_count"] = slice.Links.Count,
        };

        return payload;
    }

    public static Dictionary<string, object?> AssembleCore(
        NativeReportSlice slice,
        string? siteName = null,
        string? reportTitle = null,
        IReadOnlyDictionary<string, object?>? siteLevel = null,
        IReadOnlyDictionary<string, object?>? mlBundle = null)
    {
        siteLevel ??= new Dictionary<string, object?>();
        mlBundle ??= new Dictionary<string, object?>();

        return new Dictionary<string, object?>
        {
            ["site_name"] = siteName ?? "",
            ["report_title"] = reportTitle ?? "",
            ["report_generated_at"] = DateTimeOffset.UtcNow.ToString("O"),
            ["summary"] = slice.Summary,
            ["seo_health"] = slice.SeoHealth,
            ["issues"] = slice.Issues,
            ["recommendations"] = slice.Recommendations,
            ["categories"] = CategoryPayloadSerializer.ToPayload(slice.Categories),
            ["site_level"] = siteLevel,
            ["report_meta"] = slice.ReportMeta,
            ["hreflang_summary"] = slice.HreflangSummary,
            ["url_fingerprints"] = slice.UrlFingerprints,
            ["outbound_link_domains"] = slice.OutboundLinkDomains,
            ["redirects"] = slice.Issues.GetValueOrDefault("redirects") ?? [],
            ["links"] = slice.Links,
            ["orphan_urls"] = slice.OrphanUrls,
            ["content_urls"] = slice.ContentUrls,
            ["content_analytics"] = slice.ContentAnalytics,
            ["response_time_stats"] = slice.ResponseTimeStats,
            ["depth_distribution"] = slice.DepthDistribution,
            ["content_duplicates"] = Array.Empty<object>(),
            ["language_summary"] = new Dictionary<string, object?>(),
            ["ml_errors"] = Array.Empty<object>(),
            ["native_build"] = new Dictionary<string, object?>
            {
                ["partial"] = true,
                ["crawl_row_count"] = slice.CrawlRowCount,
                ["edge_count"] = slice.Edges.Count,
                ["category_count"] = slice.Categories.Count,
                ["lighthouse_url_count"] = slice.LighthouseByUrl.Count,
                ["link_count"] = slice.Links.Count,
                ["content_url_list_keys"] = slice.ContentUrls.Count,
            },
        };
    }

    private static object ExtractList(IReadOnlyDictionary<string, object?> dict, string key) =>
        dict.TryGetValue(key, out var val) && val is not null ? val : Array.Empty<object>();

    private static object ExtractObject(IReadOnlyDictionary<string, object?> dict, string key) =>
        dict.TryGetValue(key, out var val) && val is not null ? val : new Dictionary<string, object?>();

    private static Dictionary<string, object?> SerializeLighthouseByUrl(IReadOnlyDictionary<string, JsonNode> byUrl)
    {
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (url, node) in byUrl)
        {
            result[url] = JsonSerializer.Deserialize<object>(node.ToJsonString()) ?? new object();
        }

        return result;
    }
}
