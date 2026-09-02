using System.Text.Json;

namespace WebsiteProfiling.Contracts.Report;

public readonly record struct SiteHealthCategory(string Id, int? Score);

/// <summary>Weighted site health score from fixable audit categories (excludes search_performance, intelligence).</summary>
public static class SiteHealthScoreBuilder
{
    private static readonly Dictionary<string, double> Weights = new(StringComparer.Ordinal)
    {
        ["technical_seo"] = 0.25,
        ["link_health"] = 0.20,
        ["performance"] = 0.15,
        ["security"] = 0.15,
        ["core_web_vitals"] = 0.10,
        ["mobile"] = 0.10,
        ["html_accessibility"] = 0.05,
    };

    private static readonly HashSet<string> Excluded = new(StringComparer.Ordinal)
    {
        "search_performance",
        "intelligence",
    };

    public static int? Compute(IReadOnlyList<SiteHealthCategory> categories)
    {
        var (_, score) = ComputeWithCategoryScores(categories);
        return score;
    }

    public static (Dictionary<string, double> CategoryScores, int? SiteHealthScore) ComputeWithCategoryScores(
        IReadOnlyList<SiteHealthCategory> categories)
    {
        var categoryScores = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var cat in categories)
        {
            if (Excluded.Contains(cat.Id) || cat.Score is not int score)
            {
                continue;
            }

            categoryScores[cat.Id] = score;
        }

        return (categoryScores, WeightedScore(categoryScores));
    }

    public static (Dictionary<string, double> CategoryScores, int? SiteHealthScore) ComputeWithCategoryScores(
        IEnumerable<IReadOnlyDictionary<string, object?>> payloadCategories)
    {
        var categories = payloadCategories
            .Select(c => new SiteHealthCategory(
                c.GetValueOrDefault("id")?.ToString() ?? "",
                c.TryGetValue("score", out var s) && s is int or double or float ? Convert.ToInt32(s) : null))
            .ToList();

        return ComputeWithCategoryScores(categories);
    }

    /// <summary>
    /// Prefer payload site_health_score fields; fall back to weighted category score for older reports.
    /// </summary>
    public static int? ResolveFromPayload(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (payload.TryGetProperty("summary", out var summary)
            && summary.ValueKind == JsonValueKind.Object
            && summary.TryGetProperty("site_health_score", out var summaryScore)
            && summaryScore.ValueKind == JsonValueKind.Number
            && summaryScore.TryGetInt32(out var fromSummary))
        {
            return fromSummary;
        }

        if (payload.TryGetProperty("site_health_score", out var topScore)
            && topScore.ValueKind == JsonValueKind.Number
            && topScore.TryGetInt32(out var fromTop))
        {
            return fromTop;
        }

        if (payload.TryGetProperty("categories", out var categories)
            && categories.ValueKind == JsonValueKind.Array)
        {
            return ComputeFromJsonCategories(categories);
        }

        return null;
    }

    public static int? ComputeFromJsonCategories(JsonElement categories)
    {
        if (categories.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var list = new List<SiteHealthCategory>();
        foreach (var cat in categories.EnumerateArray())
        {
            if (cat.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var id = cat.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
                ? idEl.GetString() ?? ""
                : "";
            int? score = null;
            if (cat.TryGetProperty("score", out var scoreEl) && scoreEl.ValueKind == JsonValueKind.Number)
            {
                score = (int)Math.Round(scoreEl.GetDouble());
            }

            list.Add(new SiteHealthCategory(id, score));
        }

        return Compute(list);
    }

    private static int? WeightedScore(Dictionary<string, double> categoryScores)
    {
        double weightedSum = 0;
        double weightTotal = 0;
        foreach (var (id, weight) in Weights)
        {
            if (!categoryScores.TryGetValue(id, out var score))
            {
                continue;
            }

            weightedSum += score * weight;
            weightTotal += weight;
        }

        return weightTotal > 0
            ? (int)Math.Round(weightedSum / weightTotal)
            : null;
    }
}
