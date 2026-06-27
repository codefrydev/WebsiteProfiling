namespace ReportService.Application.Build.Categories;

/// <summary>Port of Python reporting/categories/search_performance.py.</summary>
public static class SearchPerformanceCategoryBuilder
{
    private const double MinImpressionsForCtr = 100;
    private const double StrikingMinImpressions = 10;
    private const int TrendMinDays = 6;
    private const double DeclineRatio = 0.8;

    public static ReportCategory? Build(IReadOnlyDictionary<string, object?>? googleData)
    {
        if (googleData is null)
        {
            return null;
        }

        if (JsonObjectParser.AsDict(googleData.GetValueOrDefault("gsc")) is not { } gsc)
        {
            return null;
        }

        if (JsonObjectParser.AsDict(gsc.GetValueOrDefault("summary")) is not { } summary)
        {
            return null;
        }

        var impressions = ToDouble(summary.GetValueOrDefault("impressions"));
        if (impressions <= 0)
        {
            return null;
        }

        var position = ToDouble(summary.GetValueOrDefault("position"));
        var ctr = ToDouble(summary.GetValueOrDefault("ctr"));
        var topQueries = JsonObjectParser.AsDictRows(gsc.GetValueOrDefault("top_queries")).ToList();
        var daily = JsonObjectParser.AsDictRows(gsc.GetValueOrDefault("daily")).ToList();

        var issues = new List<CategoryIssue>();
        var deductions = new List<(int Amount, bool Apply)>();

        if (position > 0)
        {
            if (position > 20)
            {
                issues.Add(new CategoryIssue(
                    $"Average Google position is {position:F1} — most queries rank beyond page 2.",
                    Priority: "High",
                    Recommendation: "Strengthen on-page relevance, internal linking, and content depth for target queries."));
                deductions.Add((35, true));
            }
            else if (position > 10)
            {
                issues.Add(new CategoryIssue(
                    $"Average Google position is {position:F1} — ranking on page 2 for many queries.",
                    Priority: "High",
                    Recommendation: "Improve on-page optimisation and internal links to push key queries onto page 1."));
                deductions.Add((20, true));
            }
            else if (position > 3)
            {
                issues.Add(new CategoryIssue(
                    $"Average Google position is {position:F1} — room to reach the top 3.",
                    Priority: "Medium",
                    Recommendation: "Refine titles, content, and internal links for queries ranking 4–10."));
                deductions.Add((8, true));
            }
        }

        if (impressions >= MinImpressionsForCtr && position > 0)
        {
            var expected = CtrCurve.IndustryCtrPercent(position);
            if (ctr < expected * 0.6)
            {
                issues.Add(new CategoryIssue(
                    $"Click-through rate ({ctr:F1}%) is below the ~{expected:F0}% typical for average position {position:F1}.",
                    Priority: "Medium",
                    Recommendation: "Improve titles and meta descriptions, and add structured data for richer SERP snippets."));
                deductions.Add((10, true));
            }
        }

        const double HighOpportunityMinImpressions = 50;
        var highOpportunity = topQueries
            .Where(q =>
            {
                var pos = ToDouble(q.GetValueOrDefault("position"));
                var impr = ToDouble(q.GetValueOrDefault("impressions"));
                return pos > 3 && pos <= 10 && impr >= HighOpportunityMinImpressions;
            })
            .ToList();
        if (highOpportunity.Count > 0)
        {
            var sample = string.Join(", ", highOpportunity.Take(3).Select(q => q.GetValueOrDefault("query")?.ToString()).Where(s => !string.IsNullOrEmpty(s)));
            var more = highOpportunity.Count > 3 ? $" (+{highOpportunity.Count - 3} more)" : "";
            issues.Add(new CategoryIssue(
                $"{highOpportunity.Count} quer(y/ies) rank on page 1 (positions 4–10): {sample}{more}.",
                Priority: "Medium",
                Recommendation: "Optimize titles, content, and internal links to push these queries into the top 3."));
            deductions.Add((Math.Min(8, highOpportunity.Count), true));
        }

        var striking = topQueries
            .Where(q =>
            {
                var pos = ToDouble(q.GetValueOrDefault("position"));
                var impr = ToDouble(q.GetValueOrDefault("impressions"));
                return pos > 10 && pos <= 20 && impr >= StrikingMinImpressions;
            })
            .ToList();
        if (striking.Count > 0)
        {
            var sample = string.Join(", ", striking.Take(3).Select(q => q.GetValueOrDefault("query")?.ToString()).Where(s => !string.IsNullOrEmpty(s)));
            var more = striking.Count > 3 ? $" (+{striking.Count - 3} more)" : "";
            issues.Add(new CategoryIssue(
                $"{striking.Count} quer(y/ies) rank on page 2 (positions 11–20): {sample}{more}.",
                Priority: "Medium",
                Recommendation: "These are close to page 1 — add internal links and refresh content to push them up."));
            deductions.Add((Math.Min(10, striking.Count), true));
        }

        var zeroClick = topQueries
            .Where(q =>
                ToDouble(q.GetValueOrDefault("impressions")) >= MinImpressionsForCtr
                && ToDouble(q.GetValueOrDefault("clicks")) == 0)
            .ToList();
        if (zeroClick.Count > 0)
        {
            var sample = string.Join(", ", zeroClick.Take(3).Select(q => q.GetValueOrDefault("query")?.ToString()).Where(s => !string.IsNullOrEmpty(s)));
            var more = zeroClick.Count > 3 ? $" (+{zeroClick.Count - 3} more)" : "";
            issues.Add(new CategoryIssue(
                $"{zeroClick.Count} quer(y/ies) get impressions but no clicks: {sample}{more}.",
                Priority: "Medium",
                Recommendation: "Review search intent match and rewrite titles/descriptions to earn the click."));
            deductions.Add((Math.Min(8, zeroClick.Count), true));
        }

        if (daily.Count >= TrendMinDays)
        {
            var mid = daily.Count / 2;
            var first = daily.Take(mid).ToList();
            var second = daily.Skip(mid).ToList();
            var firstClicks = first.Sum(d => ToDouble(d.GetValueOrDefault("clicks")));
            var secondClicks = second.Sum(d => ToDouble(d.GetValueOrDefault("clicks")));
            var firstImpr = first.Sum(d => ToDouble(d.GetValueOrDefault("impressions")));
            var secondImpr = second.Sum(d => ToDouble(d.GetValueOrDefault("impressions")));

            if (firstClicks > 0 && secondClicks < firstClicks * DeclineRatio)
            {
                issues.Add(new CategoryIssue(
                    "Search clicks are declining over the reporting window.",
                    Priority: "High",
                    Recommendation: "Investigate ranking losses or seasonality; refresh affected pages."));
                deductions.Add((12, true));
            }
            else if (firstImpr > 0 && secondImpr < firstImpr * DeclineRatio)
            {
                issues.Add(new CategoryIssue(
                    "Search impressions are declining over the reporting window.",
                    Priority: "Medium",
                    Recommendation: "Check for indexing or visibility losses; expand and refresh content."));
                deductions.Add((8, true));
            }
        }

        var score = CategoryHelpers.ScoreDeductions(100, deductions);
        var recommendations = issues
            .Select(i => i.Recommendation)
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        return new ReportCategory(
            "search_performance",
            "Search performance",
            score,
            CategoryHelpers.SortIssues(issues),
            recommendations);
    }

    private static double ToDouble(object? value) =>
        value switch
        {
            null => 0,
            double d => d,
            float f => f,
            int i => i,
            long l => l,
            decimal m => (double)m,
            string s when double.TryParse(s, out var parsed) => parsed,
            _ => 0,
        };
}
