using System.Text.Json;
using System.Text.Json.Nodes;
using Data.Application.Dto.Portfolio;
using Data.Application.Mapping;

namespace Data.Application.Portfolio;

internal static class PortfolioGrouping
{
    public static IReadOnlyList<PortfolioGroupDto> ComputeDomainGroups(
        IReadOnlyList<PortfolioReportRow> reportList,
        PortfolioMaps maps,
        Func<long, JsonElement?> getPayload)
    {
        var brandMap = new Dictionary<string, PortfolioGroupDto>(StringComparer.Ordinal);

        foreach (var r in reportList)
        {
            var payload = getPayload(r.Id);
            if (payload is not { } p) continue;

            var built = BuildReportGroup(r, p, maps);
            if (brandMap.TryGetValue(built.BrandKey, out var existing))
            {
                if (built.GeneratedAtMs <= existing.GeneratedAtMs) continue;
            }

            brandMap[built.BrandKey] = built.Group;
        }

        return brandMap.Values.OrderByDescending(g => g.GeneratedAtMs).ToList();
    }

    public static IReadOnlyList<PortfolioGroupDto> ComputeCrawlOnlyGroups(
        IReadOnlyList<PortfolioCrawlSummaryRow> crawlSummaries,
        IReadOnlyList<PortfolioGroupDto> reportGroups)
    {
        var coveredDomains = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var g in reportGroups)
        {
            var key = (FirstNonEmpty(g.DomainParam, PortfolioHelpers.ExtractHostname(g.CrawlUrl), g.DomainName)).ToLowerInvariant();
            if (!string.IsNullOrEmpty(key)) coveredDomains.Add(key);
        }

        var coveredRunIds = reportGroups
            .Where(g => g.CrawlRunId is not null)
            .Select(g => g.CrawlRunId!.Value)
            .ToHashSet();

        var brandMap = new Dictionary<string, PortfolioGroupDto>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in crawlSummaries)
        {
            if (coveredRunIds.Contains(row.CrawlRunId)) continue;

            var startUrl = row.StartUrl.Trim();
            var domainName = PortfolioHelpers.ExtractHostname(startUrl);
            if (string.IsNullOrEmpty(domainName)) domainName = PortfolioConstants.UnknownBrand;
            var domainKey = domainName.ToLowerInvariant();
            if (string.IsNullOrEmpty(domainKey) || coveredDomains.Contains(domainKey)) continue;

            var urlCount = row.UrlCount;
            var titleCoverage = PortfolioHelpers.TitleCoveragePct(row.WithTitle, urlCount);
            var generatedAtMs = PortfolioHelpers.GeneratedAtMs(row.CreatedAt);

            if (brandMap.TryGetValue(domainKey, out var existing) && generatedAtMs <= existing.GeneratedAtMs)
                continue;

            brandMap[domainKey] = new PortfolioGroupDto
            {
                DomainName = domainName,
                CrawlUrl = string.IsNullOrEmpty(startUrl) ? PortfolioConstants.EmDash : startUrl,
                UrlCount = urlCount,
                HealthScore = titleCoverage,
                StatusCounts = new PortfolioStatusCountsDto
                {
                    S2xx = row.S2xx,
                    S3xx = row.S3xx,
                    S4xx = row.S4xx,
                    S5xx = row.S5xx,
                    Other = row.Other,
                },
                LastCrawl = PortfolioHelpers.ToDisplayDateTime(row.CreatedAt),
                LastAudit = "",
                TotalIssues = 0,
                IssueCounts = EmptyIssueCounts(),
                SuccessRate = null,
                TitleCoverage = titleCoverage,
                AvgWordCount = row.AvgWordCount,
                ThinPages = row.ThinPages,
                TechnicalSeoScore = null,
                PerfScore = null,
                SeoScore = null,
                CrawlDurationS = null,
                CategorySnapshots = [],
                SeoSignals = null,
                SecurityFindings = 0,
                DuplicateClusters = 0,
                MedianWordCount = row.AvgWordCount > 0 ? row.AvgWordCount : null,
                MedianResponseMs = null,
                ReportId = null,
                CrawlRunId = row.CrawlRunId,
                CrawlOnly = true,
                GeneratedAtMs = generatedAtMs,
                DomainParam = domainKey,
                CrawlConfig = PortfolioHelpers.BuildCrawlConfigFromSummary(
                    row.RenderMode, row.DiscoveryMode, urlCount),
            };
        }

        return brandMap.Values.ToList();
    }

    public static IReadOnlyList<PortfolioGroupDto> MergeGroups(
        IReadOnlyList<PortfolioGroupDto> reportGroups,
        IReadOnlyList<PortfolioGroupDto> crawlOnlyGroups) =>
        reportGroups.Concat(crawlOnlyGroups).OrderByDescending(g => g.GeneratedAtMs).ToList();

    public static PortfolioSummaryResponseDto ComputeSummary(IReadOnlyList<PortfolioGroupDto> groups)
    {
        var totalBrands = groups.Count;
        var totalUrls = groups.Sum(g => g.UrlCount);
        int? avgHealth = totalBrands > 0
            ? (int)Math.Round(groups.Sum(g => g.HealthScore) / (double)totalBrands, MidpointRounding.ToEven)
            : null;

        return new PortfolioSummaryResponseDto
        {
            TotalBrands = totalBrands,
            TotalUrls = totalUrls,
            AvgHealth = avgHealth,
        };
    }

    private static (string BrandKey, PortfolioGroupDto Group, double GeneratedAtMs) BuildReportGroup(
        PortfolioReportRow r,
        JsonElement payload,
        PortfolioMaps maps)
    {
        long? runIdInt = null;
        var metaSlice = PayloadSliceMapper.ToReportMetaSlice(payload);
        if (metaSlice?.CrawlRunId is int crawlRunId)
        {
            runIdInt = crawlRunId;
        }
        else if (payload.TryGetProperty("crawl_run_id", out var ridEl) && ridEl.ValueKind == JsonValueKind.Number)
        {
            runIdInt = ridEl.TryGetInt64(out var l) ? l : ridEl.GetInt32();
        }

        var runStartUrl = runIdInt is not null && maps.StartUrlByRunId.TryGetValue(runIdInt.Value, out var su)
            ? su : "";
        var fallbackUrl = PortfolioHelpers.FirstUrlFromPagesOrLinks(payload);
        var crawlUrl = (runStartUrl.Length > 0 ? runStartUrl : fallbackUrl).Trim();
        var startDomain = PortfolioHelpers.ExtractHostname(runStartUrl);
        var fallbackDomain = PortfolioHelpers.ExtractHostname(crawlUrl);
        var domainName = FirstNonEmpty(startDomain, fallbackDomain,
            PortfolioHelpers.GetString(payload, "site_name", PortfolioConstants.UnknownBrand));
        var brandKey = startDomain.Length > 0
            ? startDomain
            : fallbackDomain.Length > 0 ? $"fallback:{fallbackDomain}" : $"report:{r.Id}";

        var summary = PortfolioHelpers.GetObj(payload, "summary") ?? default;
        var statusCounts = new PortfolioStatusCountsDto
        {
            S2xx = PortfolioHelpers.GetInt(summary, "count_2xx"),
            S3xx = PortfolioHelpers.GetInt(summary, "count_3xx"),
            S4xx = PortfolioHelpers.GetInt(summary, "count_4xx"),
            S5xx = PortfolioHelpers.GetInt(summary, "count_5xx"),
            Other = PortfolioHelpers.GetInt(summary, "count_error"),
        };

        var urlCount = PortfolioHelpers.CrawledUrlCount(payload);
        var successPct = urlCount > 0
            ? (int)Math.Round(statusCounts.S2xx / (double)urlCount * 100, MidpointRounding.ToEven)
            : 0;
        var healthScore = ScoreFromCategories(PortfolioHelpers.GetArrayOrEmpty(payload, "categories")) ?? 0;

        var runCreatedAt = runIdInt is not null && maps.RunCreatedAtByRunId.TryGetValue(runIdInt.Value, out var rc)
            ? rc : "";
        var lastCrawl = PortfolioHelpers.ToDisplayDateTime(
            runCreatedAt.Length > 0 ? runCreatedAt
            : PortfolioHelpers.GetString(payload, "crawl_run_created_at").Length > 0
                ? PortfolioHelpers.GetString(payload, "crawl_run_created_at")
                : PortfolioHelpers.GetString(payload, "report_generated_at").Length > 0
                    ? PortfolioHelpers.GetString(payload, "report_generated_at")
                    : r.GeneratedAt);
        var lastAudit = PortfolioHelpers.ToDisplayDateTime(
            PortfolioHelpers.GetString(payload, "report_generated_at").Length > 0
                ? PortfolioHelpers.GetString(payload, "report_generated_at")
                : r.GeneratedAt);
        var generatedAtMs = PortfolioHelpers.GeneratedAtMs(r.GeneratedAt);

        var (issueCounts, totalIssues) = IssueCountsFromPayload(payload);
        var (perfScore, seoScore) = LhScores(payload);
        var technicalSeoScore = CategoryScore(payload, "technical_seo");

        int? successRate = PortfolioHelpers.GetDoubleOrNull(summary, "success_rate") is { } sr
            ? (int)Math.Round(sr, MidpointRounding.ToEven)
            : urlCount > 0 ? successPct : null;

        int? crawlDurationS = PortfolioHelpers.GetDoubleOrNull(summary, "crawl_time_s") is { } cts
            ? (int)Math.Round(cts, MidpointRounding.ToEven)
            : null;

        JsonElement? runMetaEl = null;
        if (runIdInt is not null && maps.RunMetaByRunId.TryGetValue(runIdInt.Value, out var rm))
        {
            runMetaEl = JsonSerializer.SerializeToElement(new { render_mode = rm.RenderMode, discovery_mode = rm.DiscoveryMode });
        }

        var canonicalHost = PortfolioHelpers.CanonicalDomainFromPayload(payload, maps.StartUrlByRunId);
        if (string.IsNullOrEmpty(canonicalHost))
            canonicalHost = PortfolioHelpers.SlugifyDomain(PortfolioHelpers.GetString(payload, "site_name"));

        var group = new PortfolioGroupDto
        {
            DomainName = domainName,
            CrawlUrl = string.IsNullOrEmpty(crawlUrl) ? PortfolioConstants.EmDash : crawlUrl,
            UrlCount = urlCount,
            HealthScore = healthScore,
            StatusCounts = statusCounts,
            LastCrawl = lastCrawl,
            LastAudit = lastAudit,
            TotalIssues = totalIssues,
            IssueCounts = issueCounts,
            SuccessRate = successRate,
            TitleCoverage = null,
            AvgWordCount = null,
            ThinPages = null,
            TechnicalSeoScore = technicalSeoScore,
            PerfScore = perfScore,
            SeoScore = seoScore,
            CrawlDurationS = crawlDurationS,
            CategorySnapshots = CategorySnapshots(payload),
            SeoSignals = SeoSignals(payload),
            SecurityFindings = ArrayLength(payload, "security_findings"),
            DuplicateClusters = ArrayLength(payload, "content_duplicates"),
            MedianWordCount = MedianWordCount(payload),
            MedianResponseMs = MedianResponseMs(payload),
            ReportId = r.Id,
            CrawlRunId = runIdInt,
            GeneratedAtMs = generatedAtMs,
            DomainParam = canonicalHost,
            CrawlConfig = PortfolioHelpers.BuildCrawlConfigFromPayload(payload, runMetaEl),
            DataSources = DataSources(payload),
        };

        return (brandKey, group, generatedAtMs);
    }

    private static PortfolioIssueCountsDto EmptyIssueCounts() => new();

    private static int? ScoreFromCategories(JsonElement categories)
    {
        if (categories.ValueKind != JsonValueKind.Array) return null;
        var nums = new List<double>();
        foreach (var cat in categories.EnumerateArray())
        {
            if (cat.TryGetProperty("score", out var sc) && sc.ValueKind == JsonValueKind.Number)
                nums.Add(sc.GetDouble());
        }
        if (nums.Count == 0) return null;
        return (int)Math.Round(nums.Sum() / nums.Count, MidpointRounding.ToEven);
    }

    private static (PortfolioIssueCountsDto Counts, int Total) IssueCountsFromPayload(JsonElement payload)
    {
        var counts = EmptyIssueCounts();
        var cats = PortfolioHelpers.GetArrayOrEmpty(payload, "categories");
        if (cats.ValueKind != JsonValueKind.Array) return (counts, 0);

        foreach (var cat in cats.EnumerateArray())
        {
            var issues = PortfolioHelpers.GetArrayOrEmpty(cat, "issues");
            if (issues.ValueKind != JsonValueKind.Array) continue;
            foreach (var iss in issues.EnumerateArray())
            {
                var p = PortfolioHelpers.GetString(iss, "priority", "Medium");
                switch (p)
                {
                    case "Critical": counts.Critical++; break;
                    case "High": counts.High++; break;
                    case "Low": counts.Low++; break;
                    default: counts.Medium++; break;
                }
            }
        }

        return (counts, counts.Critical + counts.High + counts.Medium + counts.Low);
    }

    private static int? CategoryScore(JsonElement payload, string catId)
    {
        var cats = PortfolioHelpers.GetArrayOrEmpty(payload, "categories");
        if (cats.ValueKind != JsonValueKind.Array) return null;
        foreach (var cat in cats.EnumerateArray())
        {
            if (PortfolioHelpers.GetString(cat, "id") == catId &&
                cat.TryGetProperty("score", out var sc) && sc.ValueKind == JsonValueKind.Number)
                return (int)Math.Round(sc.GetDouble(), MidpointRounding.ToEven);
        }
        return null;
    }

    private static (int? Perf, int? Seo) LhScores(JsonElement payload)
    {
        if (PortfolioHelpers.GetObj(payload, "lighthouse_summary") is not { ValueKind: JsonValueKind.Object } summary)
            return (null, null);

        var mm = summary.TryGetProperty("median_metrics", out var mmEl) ? mmEl : default;
        var cs = summary.TryGetProperty("category_scores", out var csEl) ? csEl : default;

        var perfRaw = FirstTruthy(mm, "performance_score") ?? FirstTruthy(cs, "performance");
        var seoRaw = FirstTruthy(mm, "seo_score") ?? FirstTruthy(cs, "seo");

        return (
            perfRaw is not null ? (int)Math.Round(perfRaw.Value, MidpointRounding.ToEven) : null,
            seoRaw is not null ? (int)Math.Round(seoRaw.Value, MidpointRounding.ToEven) : null);
    }

    private static double? FirstTruthy(JsonElement obj, string key)
    {
        if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(key, out var v) ||
            v.ValueKind != JsonValueKind.Number)
            return null;
        var d = v.GetDouble();
        return d != 0 ? d : null;
    }

    private static IReadOnlyList<PortfolioCategorySnapshotDto> CategorySnapshots(JsonElement payload)
    {
        var cats = PortfolioHelpers.GetArrayOrEmpty(payload, "categories");
        if (cats.ValueKind != JsonValueKind.Array) return [];

        var byId = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var cat in cats.EnumerateArray())
            byId[PortfolioHelpers.GetString(cat, "id")] = cat;

        var outList = new List<PortfolioCategorySnapshotDto>();

        void Push(string catId)
        {
            if (!byId.TryGetValue(catId, out var cat) ||
                !cat.TryGetProperty("score", out var sc) || sc.ValueKind != JsonValueKind.Number)
                return;
            outList.Add(new PortfolioCategorySnapshotDto
            {
                Id = catId,
                Name = PortfolioHelpers.GetString(cat, "name", catId),
                Score = (int)Math.Round(sc.GetDouble(), MidpointRounding.ToEven),
                IssueCount = PortfolioHelpers.ArrayLength(PortfolioHelpers.GetArrayOrEmpty(cat, "issues")),
            });
        }

        foreach (var catId in PortfolioConstants.CategoryOrder) Push(catId);
        foreach (var cat in cats.EnumerateArray())
        {
            var catId = PortfolioHelpers.GetString(cat, "id");
            if (string.IsNullOrEmpty(catId) || outList.Any(r => r.Id == catId)) continue;
            if (!cat.TryGetProperty("score", out var sc) || sc.ValueKind != JsonValueKind.Number) continue;
            outList.Add(new PortfolioCategorySnapshotDto
            {
                Id = catId,
                Name = PortfolioHelpers.GetString(cat, "name", catId),
                Score = (int)Math.Round(sc.GetDouble(), MidpointRounding.ToEven),
                IssueCount = PortfolioHelpers.ArrayLength(PortfolioHelpers.GetArrayOrEmpty(cat, "issues")),
            });
        }

        return outList;
    }

    private static PortfolioSeoSignalsDto? SeoSignals(JsonElement payload)
    {
        if (PortfolioHelpers.GetObj(payload, "seo_health") is not { ValueKind: JsonValueKind.Object } s)
            return null;
        return new PortfolioSeoSignalsDto
        {
            MissingTitles = PortfolioHelpers.GetInt(s, "missing_title"),
            MissingMetaDesc = PortfolioHelpers.GetInt(s, "missing_meta_desc"),
            ThinContent = PortfolioHelpers.GetInt(s, "thin_content"),
            H1Issues = PortfolioHelpers.GetInt(s, "h1_zero") + PortfolioHelpers.GetInt(s, "h1_multi"),
        };
    }

    private static int? MedianWordCount(JsonElement payload)
    {
        if (PortfolioHelpers.GetObj(payload, "content_analytics") is not { ValueKind: JsonValueKind.Object } ca)
            return null;
        if (!ca.TryGetProperty("word_count_stats", out var wcs) ||
            wcs.ValueKind != JsonValueKind.Object ||
            !wcs.TryGetProperty("median", out var median) || median.ValueKind != JsonValueKind.Number)
            return null;
        return (int)Math.Round(median.GetDouble(), MidpointRounding.ToEven);
    }

    private static int? MedianResponseMs(JsonElement payload)
    {
        if (PortfolioHelpers.GetObj(payload, "response_time_stats") is not { ValueKind: JsonValueKind.Object } rts)
            return null;
        var p50 = PortfolioHelpers.GetDoubleOrNull(rts, "p50");
        return p50 is not null ? (int)Math.Round(p50.Value, MidpointRounding.ToEven) : null;
    }

    private static IReadOnlyList<string>? DataSources(JsonElement payload)
    {
        if (PortfolioHelpers.GetObj(payload, "report_meta") is not { ValueKind: JsonValueKind.Object } meta)
            return null;
        if (!meta.TryGetProperty("data_sources", out var raw) || raw.ValueKind != JsonValueKind.Array)
            return null;

        var outList = new List<string>();
        foreach (var item in raw.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String) continue;
            var s = item.GetString();
            if (s is not null && PortfolioConstants.DataSourceIds.Contains(s))
                outList.Add(s);
        }

        return outList.Count > 0 ? outList : null;
    }

    private static int ArrayLength(JsonElement payload, string name) =>
        PortfolioHelpers.ArrayLength(PortfolioHelpers.GetArrayOrEmpty(payload, name));

    private static string FirstNonEmpty(params string?[] values)
    {
        foreach (var v in values)
            if (!string.IsNullOrEmpty(v)) return v;
        return "";
    }
}
