using System.Globalization;
using System.Text.Json;
using FileService.Domain.Models;

namespace FileService.Application.Mapping;

public static class ChapterMappers
{
    public static AuditSnapshotModel? MapSnapshot(JsonElement payload)
    {
        var summary = payload.TryGetProperty("summary", out var s) && s.ValueKind == JsonValueKind.Object ? s : default;
        var hasSummary = summary.ValueKind == JsonValueKind.Object;
        var statusCounts = ExtractStatusCounts(payload);
        var renderMode = payload.TryGetProperty("report_meta", out var meta) && meta.ValueKind == JsonValueKind.Object
            && meta.TryGetProperty("crawl_scope", out var scope) && scope.ValueKind == JsonValueKind.Object
            ? JsonHelper.GetString(scope, "render_mode")
            : null;

        if (!hasSummary && statusCounts.Count == 0 && renderMode is null)
        {
            return null;
        }

        return new AuditSnapshotModel
        {
            TotalUrls = hasSummary ? JsonHelper.GetInt(summary, "total_urls") : null,
            IndexableUrls = hasSummary ? JsonHelper.GetInt(summary, "indexable") : null,
            TotalIssues = hasSummary ? JsonHelper.GetInt(summary, "total_issues") : null,
            CriticalIssues = hasSummary ? JsonHelper.GetInt(summary, "critical_issues") : null,
            StatusCounts = statusCounts,
            GoogleFetchedAt = meta.ValueKind == JsonValueKind.Object ? JsonHelper.GetString(meta, "google_fetched_at") : null,
            RenderMode = renderMode,
        };
    }

    public static LighthouseChapterModel? MapLighthouse(JsonElement payload)
    {
        if (!payload.TryGetProperty("lighthouse_summary", out var lh) || lh.ValueKind != JsonValueKind.Object)
        {
            return null;
        }
        var human = JsonHelper.GetString(payload, "lighthouse_human_summary") ?? "";
        var diagnostics = new List<LighthouseDiagnosticModel>();
        if (payload.TryGetProperty("lighthouse_diagnostics", out var diagEl) && diagEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var d in diagEl.EnumerateArray().Take(15))
            {
                diagnostics.Add(new LighthouseDiagnosticModel
                {
                    Title = JsonHelper.GetString(d, "title") ?? JsonHelper.GetString(d, "id") ?? "",
                    Description = JsonHelper.GetString(d, "description") ?? "",
                });
            }
        }
        return new LighthouseChapterModel
        {
            Summary = new LighthouseSummaryModel
            {
                Url = JsonHelper.GetString(lh, "url") ?? "",
                Performance = JsonHelper.GetInt(lh, "performance"),
                Accessibility = JsonHelper.GetInt(lh, "accessibility"),
                BestPractices = JsonHelper.GetInt(lh, "best_practices"),
                Seo = JsonHelper.GetInt(lh, "seo"),
            },
            HumanSummary = human,
            Diagnostics = diagnostics,
        };
    }

    public static SearchVisibilityModel? MapSearchVisibility(JsonElement payload)
    {
        if (!payload.TryGetProperty("search_performance", out var sp) || sp.ValueKind != JsonValueKind.Object)
        {
            if (!payload.TryGetProperty("gsc", out var gsc) || gsc.ValueKind != JsonValueKind.Object)
            {
                return null;
            }
            sp = gsc;
        }
        var queries = MapMetricRows(sp, "queries", "query", "clicks", "impressions");
        var pages = MapMetricRows(sp, "pages", "page", "clicks", "impressions");
        if (queries.Count == 0 && pages.Count == 0)
        {
            return null;
        }
        return new SearchVisibilityModel { TopQueries = queries, TopPages = pages };
    }

    public static TrafficSnapshotModel? MapTraffic(JsonElement payload)
    {
        if (!payload.TryGetProperty("ga4", out var ga4) || ga4.ValueKind != JsonValueKind.Object)
        {
            return null;
        }
        var channels = MapMetricRows(ga4, "channels", "channel", "sessions");
        var devices = MapMetricRows(ga4, "devices", "device", "sessions");
        if (channels.Count == 0 && devices.Count == 0)
        {
            return null;
        }
        return new TrafficSnapshotModel { Channels = channels, Devices = devices };
    }

    public static SecurityChapterModel? MapSecurity(JsonElement payload)
    {
        if (!payload.TryGetProperty("security_findings", out var arr) || arr.ValueKind != JsonValueKind.Array)
        {
            return null;
        }
        var findings = arr.EnumerateArray().Take(25).Select(f => new SecurityFindingModel
        {
            Severity = JsonHelper.GetString(f, "severity") ?? "medium",
            Type = JsonHelper.GetString(f, "finding_type") ?? JsonHelper.GetString(f, "type") ?? "",
            Url = JsonHelper.GetString(f, "url") ?? "",
            Message = JsonHelper.GetString(f, "message") ?? "",
        }).ToList();
        return findings.Count == 0 ? null : new SecurityChapterModel { Findings = findings };
    }

    public static ContentChapterModel? MapContent(JsonElement payload)
    {
        if (!payload.TryGetProperty("content_analytics", out var ca) || ca.ValueKind != JsonValueKind.Object)
        {
            return null;
        }
        var stats = ca.TryGetProperty("word_count_stats", out var wcs) && wcs.ValueKind == JsonValueKind.Object ? wcs : default;
        var keywords = new List<MetricRowModel>();
        if (ca.TryGetProperty("top_keywords_site", out var kwEl) && kwEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var kw in kwEl.EnumerateArray().Take(15))
            {
                keywords.Add(new MetricRowModel
                {
                    Label = JsonHelper.GetString(kw, "word") ?? "",
                    Value = JsonHelper.GetString(kw, "count") ?? "",
                });
            }
        }
        return new ContentChapterModel
        {
            MeanWordCount = stats.ValueKind == JsonValueKind.Object ? JsonHelper.GetInt(stats, "mean") : null,
            MedianWordCount = stats.ValueKind == JsonValueKind.Object ? JsonHelper.GetInt(stats, "median") : null,
            ThinContentCount = JsonHelper.GetInt(ca, "thin_content_count"),
            TopKeywords = keywords,
        };
    }

    public static IndexationChapterModel? MapIndexation(JsonElement payload)
    {
        if (!payload.TryGetProperty("indexation_coverage", out var ic) || ic.ValueKind != JsonValueKind.Object)
        {
            return null;
        }
        return new IndexationChapterModel
        {
            Indexable = JsonHelper.GetInt(ic, "indexable"),
            NonIndexable = JsonHelper.GetInt(ic, "non_indexable"),
            Blocked = JsonHelper.GetInt(ic, "blocked"),
            Notes = JsonHelper.GetString(ic, "notes"),
        };
    }

    public static IReadOnlyList<LinkSampleModel> MapLinkSamples(JsonElement payload, int limit = 20)
    {
        if (!payload.TryGetProperty("links", out var links) || links.ValueKind != JsonValueKind.Array)
        {
            return [];
        }
        return links.EnumerateArray().Take(limit).Select(l => new LinkSampleModel
        {
            Url = JsonHelper.GetString(l, "url") ?? "",
            Status = JsonHelper.GetString(l, "status") ?? "",
            Title = JsonHelper.GetString(l, "title") ?? "",
        }).Where(l => !string.IsNullOrWhiteSpace(l.Url)).ToList();
    }

    private static List<MetricRowModel> MapMetricRows(
        JsonElement parent,
        string arrayName,
        string labelKey,
        string valueKey,
        string? secondaryKey = null)
    {
        var rows = new List<MetricRowModel>();
        if (!parent.TryGetProperty(arrayName, out var arr) || arr.ValueKind != JsonValueKind.Array)
        {
            return rows;
        }
        foreach (var item in arr.EnumerateArray().Take(10))
        {
            var label = JsonHelper.GetString(item, labelKey) ?? JsonHelper.GetString(item, "url") ?? "";
            if (string.IsNullOrWhiteSpace(label))
            {
                continue;
            }
            rows.Add(new MetricRowModel
            {
                Label = label,
                Value = JsonHelper.GetString(item, valueKey) ?? "0",
                Secondary = secondaryKey is not null ? JsonHelper.GetString(item, secondaryKey) : null,
            });
        }
        return rows;
    }

    private static Dictionary<string, int> ExtractStatusCounts(JsonElement payload)
    {
        var result = new Dictionary<string, int>();
        if (!payload.TryGetProperty("status_counts", out var sc) || sc.ValueKind != JsonValueKind.Object)
        {
            return result;
        }
        foreach (var prop in sc.EnumerateObject())
        {
            if (prop.Value.ValueKind == JsonValueKind.Number)
            {
                result[prop.Name] = (int)Math.Round(prop.Value.GetDouble());
            }
        }
        return result;
    }
}

internal static class JsonHelper
{
    public static string? GetString(JsonElement el, string name)
    {
        if (!el.TryGetProperty(name, out var prop))
        {
            return null;
        }
        return prop.ValueKind switch
        {
            JsonValueKind.String => prop.GetString(),
            // Normalise numbers to a plain decimal string; GetRawText() would
            // leak JSON formatting like scientific notation (e.g. "1E+10").
            JsonValueKind.Number => prop.TryGetInt64(out var l)
                ? l.ToString(CultureInfo.InvariantCulture)
                : prop.GetDouble().ToString(CultureInfo.InvariantCulture),
            _ => null,
        };
    }

    public static int? GetInt(JsonElement el, string name)
    {
        if (!el.TryGetProperty(name, out var prop) || prop.ValueKind != JsonValueKind.Number)
        {
            return null;
        }
        return (int)Math.Round(prop.GetDouble());
    }
}
