using System.Text.Json;

namespace ReportService.Application.Build.Categories;

public static class CoreWebVitalsCategoryBuilder
{
    public static ReportCategory Build(
        IReadOnlyDictionary<string, object?>? lighthouseSummary,
        IReadOnlyDictionary<string, object?>? cruxSummary)
    {
        if (lighthouseSummary is null)
        {
            return BuildNotMeasured();
        }

        var issues = new List<CategoryIssue>();
        var recommendations = new List<string>();
        int? perfScore = null;

        if (lighthouseSummary.TryGetValue("median_metrics", out var mmObj)
            && mmObj is JsonElement mm
            && mm.ValueKind == JsonValueKind.Object
            && mm.TryGetProperty("performance_score", out var ps)
            && ps.TryGetDouble(out var scoreRaw))
        {
            perfScore = Math.Max(0, Math.Min(100, (int)Math.Round(scoreRaw * 100)));
        }

        if (cruxSummary is not null
            && GetBool(cruxSummary, "ok") == true
            && cruxSummary.TryGetValue("pass", out var passObj)
            && passObj is JsonElement pass
            && pass.ValueKind == JsonValueKind.Object)
        {
            foreach (var (metric, label, rec) in new[]
                     {
                         ("lcp", "LCP", "Improve largest contentful paint (field data)."),
                         ("inp", "INP", "Reduce interaction to next paint (field data)."),
                         ("cls", "CLS", "Reduce cumulative layout shift (field data)."),
                     })
            {
                if (pass.TryGetProperty(metric, out var m) && m.ValueKind == JsonValueKind.False)
                {
                    issues.Add(CategoryHelpers.Issue(
                        $"CrUX field data: {label} does not pass Core Web Vitals threshold.",
                        priority: "High",
                        recommendation: rec));
                }
            }
        }

        if (issues.Count == 0 && perfScore is < 80)
        {
            recommendations.Add("Improve Core Web Vitals (LCP, CLS, TBT) per Lighthouse recommendations.");
        }

        if (recommendations.Count == 0)
        {
            recommendations.Add("Core Web Vitals measured by Lighthouse; see median_metrics in lighthouse_summary.json.");
        }

        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "core_web_vitals",
            "Core Web Vitals",
            perfScore,
            sorted,
            recommendations);
    }

    private static ReportCategory BuildNotMeasured() =>
        new(
            "core_web_vitals",
            "Core Web Vitals",
            null,
            [
                CategoryHelpers.Issue(
                    "LCP, INP, and CLS are not measured by this crawl.",
                    priority: "Medium",
                    recommendation: "Run Lighthouse (PageSpeed Insights) from Run audit to measure Core Web Vitals."),
            ],
            ["Run Lighthouse from Run audit to measure LCP, INP, and CLS."]);

    private static bool? GetBool(IReadOnlyDictionary<string, object?> dict, string key)
    {
        if (!dict.TryGetValue(key, out var val) || val is null)
        {
            return null;
        }

        return val switch
        {
            bool b => b,
            JsonElement { ValueKind: JsonValueKind.True } => true,
            JsonElement { ValueKind: JsonValueKind.False } => false,
            _ => null,
        };
    }
}
