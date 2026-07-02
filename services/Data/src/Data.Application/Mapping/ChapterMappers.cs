using System.Globalization;
using System.Text.Json;
using Data.Domain.Models;
using WebsiteProfiling.Contracts.Json;

namespace Data.Application.Mapping;

public static class ChapterMappers
{
    public static AuditSnapshotModel? MapSnapshot(JsonElement payload)
    {
        var summary = payload.TryGetProperty("summary", out var s) && s.ValueKind == JsonValueKind.Object ? s : default;
        var hasSummary = summary.ValueKind == JsonValueKind.Object;
        var statusCounts = ExtractStatusCounts(payload);
        var renderMode = payload.TryGetProperty("report_meta", out var meta) && meta.ValueKind == JsonValueKind.Object
            && meta.TryGetProperty("crawl_scope", out var scope) && scope.ValueKind == JsonValueKind.Object
            ? JsonCoercion.GetString(scope, "render_mode")
            : null;

        if (!hasSummary && statusCounts.Count == 0 && renderMode is null)
        {
            return null;
        }

        return new AuditSnapshotModel
        {
            TotalUrls = hasSummary ? JsonCoercion.GetInt(summary, "total_urls") : null,
            IndexableUrls = hasSummary ? JsonCoercion.GetInt(summary, "indexable") : null,
            TotalIssues = hasSummary ? JsonCoercion.GetInt(summary, "total_issues") : null,
            CriticalIssues = hasSummary ? JsonCoercion.GetInt(summary, "critical_issues") : null,
            StatusCounts = statusCounts,
            GoogleFetchedAt = meta.ValueKind == JsonValueKind.Object ? JsonCoercion.GetString(meta, "google_fetched_at") : null,
            RenderMode = renderMode,
        };
    }

    public static LighthouseChapterModel? MapLighthouse(JsonElement payload)
    {
        if (!payload.TryGetProperty("lighthouse_summary", out var lh) || lh.ValueKind != JsonValueKind.Object)
        {
            return null;
        }
        var human = JsonCoercion.GetString(payload, "lighthouse_human_summary") ?? "";
        var diagnostics = new List<LighthouseDiagnosticModel>();
        if (payload.TryGetProperty("lighthouse_diagnostics", out var diagEl) && diagEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var d in diagEl.EnumerateArray().Take(15))
            {
                diagnostics.Add(new LighthouseDiagnosticModel
                {
                    Title = JsonCoercion.GetString(d, "title") ?? JsonCoercion.GetString(d, "id") ?? "",
                    Description = JsonCoercion.GetString(d, "description") ?? "",
                });
            }
        }
        return new LighthouseChapterModel
        {
            Summary = new LighthouseSummaryModel
            {
                Url = JsonCoercion.GetString(lh, "url") ?? "",
                Performance = JsonCoercion.GetInt(lh, "performance"),
                Accessibility = JsonCoercion.GetInt(lh, "accessibility"),
                BestPractices = JsonCoercion.GetInt(lh, "best_practices"),
                Seo = JsonCoercion.GetInt(lh, "seo"),
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
            Severity = JsonCoercion.GetString(f, "severity") ?? "medium",
            Type = JsonCoercion.GetString(f, "finding_type") ?? JsonCoercion.GetString(f, "type") ?? "",
            Url = JsonCoercion.GetString(f, "url") ?? "",
            Message = JsonCoercion.GetString(f, "message") ?? "",
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
                    Label = JsonCoercion.GetString(kw, "word") ?? "",
                    Value = JsonCoercion.GetString(kw, "count") ?? "",
                });
            }
        }
        return new ContentChapterModel
        {
            MeanWordCount = stats.ValueKind == JsonValueKind.Object ? JsonCoercion.GetInt(stats, "mean") : null,
            MedianWordCount = stats.ValueKind == JsonValueKind.Object ? JsonCoercion.GetInt(stats, "median") : null,
            ThinContentCount = JsonCoercion.GetInt(ca, "thin_content_count"),
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
            Indexable = JsonCoercion.GetInt(ic, "indexable"),
            NonIndexable = JsonCoercion.GetInt(ic, "non_indexable"),
            Blocked = JsonCoercion.GetInt(ic, "blocked"),
            Notes = JsonCoercion.GetString(ic, "notes"),
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
            Url = JsonCoercion.GetString(l, "url") ?? "",
            Status = JsonCoercion.GetString(l, "status") ?? "",
            Title = JsonCoercion.GetString(l, "title") ?? "",
        }).Where(l => !string.IsNullOrWhiteSpace(l.Url)).ToList();
    }

    public static IReadOnlyList<LinkSampleModel> MapSitemapLinks(JsonElement payload, int maxUrls = 50000)
    {
        if (!payload.TryGetProperty("links", out var links) || links.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var cap = Math.Max(1, maxUrls);
        var rows = new List<LinkSampleModel>();
        foreach (var row in links.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Object || IsTruthy(row, "noindex"))
            {
                continue;
            }

            var status = JsonCoercion.GetString(row, "status") ?? "";
            if (!status.StartsWith('2'))
            {
                continue;
            }

            var url = (JsonCoercion.GetString(row, "url") ?? "").Trim();
            if (url.Length == 0)
            {
                continue;
            }

            rows.Add(new LinkSampleModel { Url = url, Status = status, Title = JsonCoercion.GetString(row, "title") ?? "" });
            if (rows.Count >= cap)
            {
                break;
            }
        }

        return rows;
    }

    private static bool IsTruthy(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v))
        {
            return false;
        }

        return v.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.String => !string.IsNullOrEmpty(v.GetString()),
            JsonValueKind.Number => v.TryGetDouble(out var d) && d != 0,
            JsonValueKind.Array => v.GetArrayLength() > 0,
            JsonValueKind.Object => v.EnumerateObject().Any(),
            _ => false,
        };
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
            var label = JsonCoercion.GetString(item, labelKey) ?? JsonCoercion.GetString(item, "url") ?? "";
            if (string.IsNullOrWhiteSpace(label))
            {
                continue;
            }
            rows.Add(new MetricRowModel
            {
                Label = label,
                Value = JsonCoercion.GetString(item, valueKey) ?? "0",
                Secondary = secondaryKey is not null ? JsonCoercion.GetString(item, secondaryKey) : null,
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
