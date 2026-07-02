using System.Globalization;
using System.Text.Json;
using Data.Domain.Models;
using WebsiteProfiling.Contracts.Json;
using WebsiteProfiling.Contracts.Report;

namespace Data.Application.Mapping;

public static class AuditReportMapper
{
    private const int IssuesTotalLimit = 120;
    private const int IssuesPerGroupLimit = 25;
    private const int TopIssuesCoverLimit = 6;

    private static readonly Dictionary<string, int> PriorityOrder = new(StringComparer.OrdinalIgnoreCase)
    {
        ["critical"] = 0,
        ["high"] = 1,
        ["medium"] = 2,
        ["low"] = 3,
    };

    public static AuditReportModel Map(
        JsonElement payload,
        int reportId,
        PdfProfile profile,
        PdfBrandingModel branding)
    {
        var exportedAt = DateTime.UtcNow.ToString("dd MMMM yyyy, HH:mm 'UTC'", CultureInfo.InvariantCulture);
        var allIssues = ExtractIssues(payload);
        var issueCounts = CountByPriority(allIssues);
        var healthScore = ComputeOverallScore(payload);
        var exec = ExtractExecutiveSummary(payload, allIssues);
        var limitedIssues = LimitIssues(allIssues, profile);
        var truncationNotes = BuildTruncationNotes(allIssues, limitedIssues);
        var includeChapters = profile is PdfProfile.Full or PdfProfile.Premium;

        return new AuditReportModel
        {
            ReportId = reportId,
            SiteName = JsonCoercion.GetString(payload, "site_name") ?? "Site",
            ReportTitle = JsonCoercion.GetString(payload, "report_title") ?? "Technical SEO Audit Report",
            GeneratedAt = FormatReportDate(JsonCoercion.GetString(payload, "report_generated_at")),
            ExportedAt = exportedAt,
            HealthScore = healthScore,
            ScoreBand = ScoreBand(healthScore),
            TotalIssueCount = allIssues.Count,
            DataSources = ExtractDataSources(payload),
            Branding = branding,
            ExecutiveSummary = exec,
            CategoryScores = ExtractCategoryScores(payload),
            Issues = limitedIssues,
            IssueCounts = issueCounts,
            Snapshot = ChapterMappers.MapSnapshot(payload),
            Lighthouse = includeChapters ? ChapterMappers.MapLighthouse(payload) : null,
            SearchVisibility = includeChapters ? ChapterMappers.MapSearchVisibility(payload) : null,
            Traffic = includeChapters ? ChapterMappers.MapTraffic(payload) : null,
            Security = includeChapters ? ChapterMappers.MapSecurity(payload) : null,
            Content = includeChapters ? ChapterMappers.MapContent(payload) : null,
            Indexation = includeChapters ? ChapterMappers.MapIndexation(payload) : null,
            LinkSamples = ChapterMappers.MapLinkSamples(payload),
            TruncationNotes = truncationNotes,
            CrawlScope = ExtractCrawlScope(payload),
        };
    }

    private static List<IssueRecord> ExtractIssues(JsonElement payload)
    {
        var rows = new List<IssueRecord>();
        if (!payload.TryGetProperty("categories", out var categories) || categories.ValueKind != JsonValueKind.Array)
        {
            return rows;
        }

        foreach (var cat in categories.EnumerateArray())
        {
            var catName = JsonCoercion.GetString(cat, "name") ?? "";
            if (!cat.TryGetProperty("issues", out var issues) || issues.ValueKind != JsonValueKind.Array)
            {
                continue;
            }
            foreach (var issue in issues.EnumerateArray())
            {
                var rule = JsonCoercion.GetString(issue, "recommendation") ?? "";
                var llm = JsonCoercion.GetString(issue, "llm_recommendation") ?? "";
                var rec = !string.IsNullOrWhiteSpace(llm) ? llm : rule;
                rows.Add(IssueNormalizer.Normalize(
                    CategoryDisplayName(catName),
                    JsonCoercion.GetString(issue, "priority") ?? "",
                    JsonCoercion.GetString(issue, "message") ?? "",
                    JsonCoercion.GetString(issue, "url") ?? "",
                    rec,
                    JsonCoercion.GetInt(issue, "gsc_clicks"),
                    JsonCoercion.GetInt(issue, "gsc_impressions"),
                    JsonCoercion.GetInt(issue, "impact_score")));
            }
        }

        rows.Sort((a, b) =>
        {
            var pa = PriorityOrder.GetValueOrDefault(a.Priority.ToLowerInvariant(), 9);
            var pb = PriorityOrder.GetValueOrDefault(b.Priority.ToLowerInvariant(), 9);
            return pa != pb ? pa.CompareTo(pb) : string.Compare(a.Headline, b.Headline, StringComparison.Ordinal);
        });
        return rows;
    }

    private static IReadOnlyList<IssueRecord> LimitIssues(List<IssueRecord> allIssues, PdfProfile profile)
    {
        var max = profile switch
        {
            PdfProfile.Executive => TopIssuesCoverLimit,
            _ => IssuesTotalLimit,
        };

        if (profile == PdfProfile.Executive)
        {
            return allIssues.Take(max).ToList();
        }

        var result = new List<IssueRecord>();
        var perGroup = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var issue in allIssues)
        {
            if (result.Count >= max)
            {
                break;
            }
            var key = issue.Priority.ToLowerInvariant();
            perGroup.TryGetValue(key, out var count);
            if (count >= IssuesPerGroupLimit)
            {
                continue;
            }
            perGroup[key] = count + 1;
            result.Add(issue);
        }
        return result;
    }

    private static ExecutiveSummaryModel ExtractExecutiveSummary(JsonElement payload, List<IssueRecord> allIssues)
    {
        var summary = "";
        var source = "";
        var priorities = new List<string>();
        var topIssues = new List<IssueRecord>();

        if (payload.TryGetProperty("executive_summary", out var exec) && exec.ValueKind == JsonValueKind.Object)
        {
            summary = JsonCoercion.GetString(exec, "summary") ?? "";
            source = ExecutiveSourceLabel(JsonCoercion.GetString(exec, "source"));
            if (exec.TryGetProperty("priorities", out var priEl) && priEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in priEl.EnumerateArray())
                {
                    var s = p.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s))
                    {
                        priorities.Add(s);
                    }
                }
            }
            if (exec.TryGetProperty("top_issues", out var topEl) && topEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var issue in topEl.EnumerateArray().Take(8))
                {
                    topIssues.Add(IssueNormalizer.Normalize(
                        JsonCoercion.GetString(issue, "category") ?? "",
                        JsonCoercion.GetString(issue, "priority") ?? "",
                        JsonCoercion.GetString(issue, "message") ?? "",
                        JsonCoercion.GetString(issue, "url") ?? "",
                        JsonCoercion.GetString(issue, "recommendation") ?? "",
                        null, null, null));
                }
            }
        }

        if (string.IsNullOrWhiteSpace(summary) && payload.TryGetProperty("recommendations", out var recs) && recs.ValueKind == JsonValueKind.Array)
        {
            var legacy = recs.EnumerateArray()
                .Select(r => r.GetString()?.Trim())
                .Where(s => !string.IsNullOrEmpty(s))
                .Take(12)
                .Select(s => $"• {s}")
                .ToList();
            if (legacy.Count > 0)
            {
                summary = string.Join("\n", legacy);
            }
        }

        if (topIssues.Count == 0)
        {
            topIssues = allIssues.Take(TopIssuesCoverLimit).ToList();
        }

        return new ExecutiveSummaryModel
        {
            Summary = summary,
            SourceLabel = source,
            Priorities = priorities,
            TopIssues = topIssues,
        };
    }

    private static IReadOnlyList<CategoryScoreModel> ExtractCategoryScores(JsonElement payload)
    {
        var scores = new List<CategoryScoreModel>();
        if (!payload.TryGetProperty("categories", out var categories) || categories.ValueKind != JsonValueKind.Array)
        {
            return scores;
        }
        foreach (var cat in categories.EnumerateArray())
        {
            int issueCount = 0;
            if (cat.TryGetProperty("issues", out var issues) && issues.ValueKind == JsonValueKind.Array)
            {
                issueCount = issues.GetArrayLength();
            }
            scores.Add(new CategoryScoreModel
            {
                Name = CategoryDisplayName(JsonCoercion.GetString(cat, "name") ?? ""),
                Score = JsonCoercion.GetInt(cat, "score"),
                IssueCount = issueCount,
            });
        }
        return scores;
    }

    private static CrawlScopeModel? ExtractCrawlScope(JsonElement payload)
    {
        if (!payload.TryGetProperty("report_meta", out var meta) || meta.ValueKind != JsonValueKind.Object)
        {
            return null;
        }
        if (!meta.TryGetProperty("crawl_scope", out var scope) || scope.ValueKind != JsonValueKind.Object)
        {
            return null;
        }
        return new CrawlScopeModel
        {
            PagesCrawled = JsonCoercion.GetInt(scope, "pages_crawled"),
            MaxPagesConfigured = JsonCoercion.GetInt(scope, "max_pages_configured"),
        };
    }

    private static IReadOnlyList<string> ExtractDataSources(JsonElement payload)
    {
        if (!payload.TryGetProperty("report_meta", out var meta) || meta.ValueKind != JsonValueKind.Object)
        {
            return [];
        }
        if (!meta.TryGetProperty("data_sources", out var sources) || sources.ValueKind != JsonValueKind.Array)
        {
            return [];
        }
        return sources.EnumerateArray()
            .Select(s => s.GetString())
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s!)
            .ToList();
    }

    private static IReadOnlyList<string> BuildTruncationNotes(List<IssueRecord> all, IReadOnlyList<IssueRecord> limited)
    {
        if (all.Count <= limited.Count)
        {
            return [];
        }
        return [$"Showing {limited.Count} of {all.Count} issues — export CSV for the full list."];
    }

    private static Dictionary<string, int> CountByPriority(IEnumerable<IssueRecord> issues)
    {
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["critical"] = 0,
            ["high"] = 0,
            ["medium"] = 0,
            ["low"] = 0,
        };
        foreach (var issue in issues)
        {
            var key = issue.Priority.ToLowerInvariant();
            if (counts.ContainsKey(key))
            {
                counts[key]++;
            }
        }
        return counts;
    }

    private static int? ComputeOverallScore(JsonElement payload)
    {
        if (payload.TryGetProperty("overall_score", out var overall) && overall.ValueKind == JsonValueKind.Number)
        {
            return (int)Math.Round(overall.GetDouble());
        }

        return SiteHealthScoreBuilder.ResolveFromPayload(payload);
    }

    private static string ScoreBand(int? score) => score switch
    {
        >= 80 => "Excellent",
        >= 60 => "Good",
        >= 40 => "Needs work",
        _ => "Critical",
    };

    private static string ExecutiveSourceLabel(string? source) => source switch
    {
        "ai_insights" => "AI insights",
        "deterministic" => "Measured + Search Console",
        _ => source ?? "Audit data",
    };

    private static string CategoryDisplayName(string name) => name switch
    {
        "technical_seo" => "Technical SEO",
        "content" => "Content",
        "performance" => "Performance",
        "security" => "Security",
        "indexation" => "Indexation",
        "links" => "Links",
        _ => string.IsNullOrWhiteSpace(name)
            ? "General"
            : CultureInfo.InvariantCulture.TextInfo.ToTitleCase(name.Replace('_', ' ')),
    };

    private static string FormatReportDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return "";
        }
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
        {
            return dt.ToUniversalTime().ToString("dd MMMM yyyy", CultureInfo.InvariantCulture);
        }
        return raw;
    }
}
