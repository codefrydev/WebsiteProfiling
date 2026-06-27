using ReportService.Application.Repositories;

namespace ReportService.Application.Build.Categories;

public static class PerformanceCategoryBuilder
{
    private const int P95ThresholdMs = 3000;

    public static ReportCategory Build(IReadOnlyList<CrawlRow> rows)
    {
        var success = CategoryHelpers.SuccessRows(rows);
        if (success.Count == 0)
        {
            return new ReportCategory("performance", "Performance", 0, [], []);
        }

        var issues = new List<CategoryIssue>();
        var deductions = new List<(int, bool)>();

        if (success.Any(r => r.ResponseTimeMs.HasValue))
        {
            var slow = success.Count(r => r.ResponseTimeMs is > CategoryHelpers.ResponseTimeSlowMs);
            if (slow > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{slow} page(s) have server response time > {CategoryHelpers.ResponseTimeSlowMs / 1000}s.",
                    priority: slow > 5 ? "High" : "Medium",
                    recommendation: "Optimize server response time (TTFB): caching, CDN, or backend tuning."));
                deductions.Add((Math.Min(20, slow * 2), true));
            }

            var validRt = success
                .Select(r => r.ResponseTimeMs)
                .Where(v => v is > 0)
                .Select(v => v!.Value)
                .OrderBy(v => v)
                .ToList();
            if (validRt.Count > 5)
            {
                var p95Index = (int)Math.Ceiling(validRt.Count * 0.95) - 1;
                p95Index = Math.Clamp(p95Index, 0, validRt.Count - 1);
                var p95 = validRt[p95Index];
                if (p95 > P95ThresholdMs)
                {
                    issues.Add(CategoryHelpers.Issue(
                        $"95th percentile response time is {p95}ms (over 3s).",
                        priority: "High",
                        recommendation: "Investigate slowest pages; consider CDN, server-side caching, or database optimization."));
                    deductions.Add((10, true));
                }
            }
        }

        if (success.Any(r => r.ImagesTotal is > 0))
        {
            var totalImgs = success.Sum(r => r.ImagesTotal ?? 0);
            if (totalImgs > 0)
            {
                var noLazy = success.Sum(r => r.ImgWithoutLazy ?? 0);
                if (noLazy > 0)
                {
                    var lazyPct = noLazy * 100.0 / totalImgs;
                    if (lazyPct > 20)
                    {
                        issues.Add(CategoryHelpers.Issue(
                            "Many images without lazy loading.",
                            priority: "Medium",
                            recommendation: "Add loading='lazy' to off-screen images."));
                        deductions.Add((Math.Min(15, (int)(noLazy * 10.0 / totalImgs)), true));
                    }
                }

                var noDims = success.Sum(r => r.ImgWithoutDimensions ?? 0);
                if (noDims > 0)
                {
                    issues.Add(CategoryHelpers.Issue(
                        $"{noDims} image(s) without width/height (can cause CLS).",
                        priority: "High",
                        recommendation: "Set width and height attributes on img tags to avoid layout shift."));
                    deductions.Add((10, true));
                }
            }
        }

        if (success.Any(r => r.CacheControl is not null))
        {
            var noCache = success.Count(r => string.IsNullOrWhiteSpace(r.CacheControl));
            if (noCache > success.Count * 0.5)
            {
                issues.Add(CategoryHelpers.Issue(
                    "Many pages without Cache-Control header.",
                    priority: "Medium",
                    recommendation: "Set Cache-Control (and optionally ETag) for static and cacheable pages."));
                deductions.Add((10, true));
            }
        }

        if (success.Any(r => r.ScriptCount.HasValue))
        {
            var scriptSum = success.Sum(r => r.ScriptCount ?? 0);
            if (scriptSum > success.Count * 10)
            {
                issues.Add(CategoryHelpers.Issue(
                    "High number of script tags across pages.",
                    priority: "Low",
                    recommendation: "Consider bundling and code-splitting to reduce JS payload."));
                deductions.Add((5, true));
            }
        }

        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "performance",
            "Performance",
            CategoryHelpers.ScoreDeductions(100, deductions),
            sorted,
            CategoryHelpers.RecommendationsFromIssues(sorted));
    }
}
