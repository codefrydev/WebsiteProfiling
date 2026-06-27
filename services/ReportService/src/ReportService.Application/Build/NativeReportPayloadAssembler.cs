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
        payload["keyword_opportunities"] = slice.KeywordOpportunities
            ?? new Dictionary<string, object?>
            {
                ["quick_wins"] = Array.Empty<object>(),
                ["high_value"] = Array.Empty<object>(),
                ["token_topic_clusters"] = Array.Empty<object>(),
            };
        payload["semantic_keyword_clusters"] = slice.SemanticKeywordClusters ?? [];
        payload["image_inventory"] = slice.ImageInventory ?? [];
        payload["image_inventory_summary"] = slice.ImageInventorySummary
            ?? new Dictionary<string, object?>
            {
                ["probed"] = 0,
                ["failed"] = 0,
                ["total_bytes"] = 0,
                ["over_threshold_count"] = 0,
                ["unoptimized_min_kb"] = 200,
                ["inventory_available"] = false,
            };
        payload["optional_audit_urls"] = slice.OptionalAuditUrls
            ?? new Dictionary<string, object?>
            {
                ["spell"] = Array.Empty<object>(),
                ["html"] = Array.Empty<object>(),
                ["amp"] = Array.Empty<object>(),
                ["pagination"] = Array.Empty<object>(),
            };
        if (slice.OptionalAuditMeta is not null)
        {
            foreach (var (key, value) in slice.OptionalAuditMeta)
            {
                payload[key] = value;
            }
        }
        payload["lighthouse_failure_urls"] = slice.LighthouseFailureUrls
            ?? new Dictionary<string, object?>
            {
                ["lcp"] = Array.Empty<object>(),
                ["inp"] = Array.Empty<object>(),
                ["cls"] = Array.Empty<object>(),
                ["seo"] = Array.Empty<object>(),
            };
        payload["contact_intelligence"] = slice.ContactIntelligence ?? new Dictionary<string, object?>();
        if (slice.Subdomains is not null)
        {
            payload["subdomains"] = slice.Subdomains;
        }

        if (slice.CrawlSegments is not null)
        {
            payload["crawl_segments"] = slice.CrawlSegments;
        }
        payload["lighthouse_by_url"] = SerializeLighthouseByUrl(slice.LighthouseByUrl);

        if (slice.LighthouseSummary is not null)
        {
            payload["lighthouse_summary"] = slice.LighthouseSummary;
            payload["lighthouse_diagnostics"] = LighthouseJsonHelper.ExtractList(slice.LighthouseSummary, "diagnostics");
            payload["lighthouse_human_summary"] = LighthouseJsonHelper.ExtractHumanSummary(slice.LighthouseSummary);
        }

        if (slice.CruxSummary is not null)
        {
            payload["crux_summary"] = slice.CruxSummary;
        }

        MergeAnalysisIntoPayload(payload, mlBundle);

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

        var (categoryScores, siteHealthScore) = SiteHealthScoreBuilder.ComputeWithCategoryScores(slice.Categories);
        var summary = new Dictionary<string, object?>(slice.Summary)
        {
            ["site_health_score"] = siteHealthScore,
            ["category_scores"] = categoryScores,
        };

        var payload = new Dictionary<string, object?>
        {
            ["site_name"] = siteName ?? "",
            ["report_title"] = reportTitle ?? "",
            ["report_generated_at"] = DateTimeOffset.UtcNow.ToString("O"),
            ["summary"] = summary,
            ["site_health_score"] = siteHealthScore,
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

        MergeAnalysisIntoPayload(payload, mlBundle);
        return payload;
    }

    /// <summary>Port of Python analysis/local.py merge_analysis_into_payload.</summary>
    public static void MergeAnalysisIntoPayload(
        Dictionary<string, object?> payload,
        IReadOnlyDictionary<string, object?>? mlBundle)
    {
        mlBundle ??= new Dictionary<string, object?>();

        payload["content_duplicates"] = mlBundle.GetValueOrDefault("content_duplicates") ?? Array.Empty<object>();
        payload.Remove("anomalies");

        payload["language_summary"] = mlBundle.GetValueOrDefault("language_summary")
            ?? new Dictionary<string, object?> { ["counts"] = new Dictionary<string, int>(), ["mixed_site"] = false };

        if (mlBundle.TryGetValue("ner_site_summary", out var nerSummary)
            && nerSummary is Dictionary<string, object?> nerDict
            && nerDict.Count > 0)
        {
            payload["ner_site_summary"] = nerDict;
        }
        else
        {
            payload.Remove("ner_site_summary");
        }

        if (mlBundle.TryGetValue("ml_errors", out var errRaw) && errRaw is not null && HasMlErrors(errRaw))
        {
            payload["ml_errors"] = errRaw switch
            {
                List<string> stringErrors => stringErrors.Cast<object?>().ToList(),
                IEnumerable<object?> objectErrors => objectErrors.ToList(),
                _ => [errRaw.ToString()],
            };
        }
        else
        {
            payload.Remove("ml_errors");
        }

        var dupGid = MlBundleMaps.UrlObjectMap(mlBundle, "url_duplicate_group_id");
        var simMap = MlBundleMaps.UrlListMap(mlBundle, "similar_internal_by_url");
        var langMap = MlBundleMaps.UrlStringMap(mlBundle, "language_by_url");
        var nlpMap = MlBundleMaps.UrlObjectMap(mlBundle, "spacy_by_url");
        var kpMap = MlBundleMaps.UrlListMap(mlBundle, "keyphrases_by_url");

        if (payload.GetValueOrDefault("links") is not List<Dictionary<string, object?>> links)
        {
            return;
        }

        foreach (var rec in links)
        {
            var url = rec.GetValueOrDefault("url")?.ToString()?.Trim() ?? "";
            var urlKey = url.TrimEnd('/');

            rec.Remove("duplicate_group_id");
            rec.Remove("similar_internal");
            rec.Remove("detected_language");
            rec.Remove("nlp_entities");
            rec.Remove("ml_anomaly");
            rec.Remove("keyphrases");

            if (dupGid.TryGetValue(urlKey, out var gid) || dupGid.TryGetValue(url, out gid))
            {
                rec["duplicate_group_id"] = LinksListBuilder.UnwrapJsonValue(gid);
            }

            if (simMap.TryGetValue(urlKey, out var similar) || simMap.TryGetValue(url, out similar))
            {
                rec["similar_internal"] = similar;
            }

            if (langMap.TryGetValue(urlKey, out var lang) || langMap.TryGetValue(url, out lang))
            {
                rec["detected_language"] = lang;
            }

            if (nlpMap.TryGetValue(urlKey, out var nlp) || nlpMap.TryGetValue(url, out nlp))
            {
                rec["nlp_entities"] = nlp;
            }

            if (kpMap.TryGetValue(urlKey, out var kp) || kpMap.TryGetValue(url, out kp))
            {
                rec["keyphrases"] = kp;
            }

            if (rec.GetValueOrDefault("page_analysis") is Dictionary<string, object?> pageAnalysis)
            {
                if (pageAnalysis.TryGetValue("signals", out var signalsObj)
                    && signalsObj is Dictionary<string, object?> signals)
                {
                    signals.Remove("language");
                    signals.Remove("nlp_entities");
                    if (signals.Count == 0)
                    {
                        pageAnalysis.Remove("signals");
                    }
                }

                if (langMap.TryGetValue(urlKey, out lang) || langMap.TryGetValue(url, out lang))
                {
                    EnsureSignals(pageAnalysis)["language"] = lang;
                }

                if (nlpMap.TryGetValue(urlKey, out nlp) || nlpMap.TryGetValue(url, out nlp))
                {
                    EnsureSignals(pageAnalysis)["nlp_entities"] = nlp;
                }

                rec["page_analysis"] = pageAnalysis;
            }
        }
    }

    private static Dictionary<string, object?> EnsureSignals(Dictionary<string, object?> pageAnalysis)
    {
        if (!pageAnalysis.TryGetValue("signals", out var signalsObj)
            || signalsObj is not Dictionary<string, object?> signals)
        {
            signals = new Dictionary<string, object?>();
            pageAnalysis["signals"] = signals;
        }

        return signals;
    }

    private static bool HasMlErrors(object errRaw) =>
        errRaw switch
        {
            List<string> stringErrors => stringErrors.Count > 0,
            IEnumerable<object?> objectErrors => objectErrors.Any(),
            _ => !string.IsNullOrWhiteSpace(errRaw.ToString()),
        };

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
