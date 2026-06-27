namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/issue_impact.py — GSC/GA4 traffic on category issues.</summary>
public static class IssueImpactEnricher
{
    private static readonly Dictionary<string, int> PriorityWeight = new(StringComparer.Ordinal)
    {
        ["Critical"] = 1000,
        ["High"] = 100,
        ["Medium"] = 10,
        ["Low"] = 1,
    };

    public static IReadOnlyList<ReportCategory> Enrich(
        IReadOnlyList<ReportCategory> categories,
        IReadOnlyDictionary<string, object?>? googleData)
    {
        var (clicksByUrl, sessionsByPath) = MetricsByUrl(googleData);
        if (clicksByUrl.Count == 0 && sessionsByPath.Count == 0)
        {
            return categories;
        }

        return categories
            .Select(cat => cat with
            {
                Issues = cat.Issues
                    .Select(issue => EnrichIssue(issue, clicksByUrl, sessionsByPath))
                    .ToList(),
            })
            .ToList();
    }

    public static double ComputeImpactScore(string priority, double gscClicks, double ga4Sessions)
    {
        var baseWeight = PriorityWeight.GetValueOrDefault(priority, 1);
        return Math.Round(baseWeight + gscClicks * 10.0 + ga4Sessions * 5.0, 2);
    }

    private static CategoryIssue EnrichIssue(
        CategoryIssue issue,
        IReadOnlyDictionary<string, Dictionary<string, double>> clicksByUrl,
        IReadOnlyDictionary<string, Dictionary<string, double>> sessionsByPath)
    {
        var url = (issue.Url ?? "").Trim().ToLowerInvariant();
        clicksByUrl.TryGetValue(url, out var gsc);
        var gscClicks = gsc?.GetValueOrDefault("gsc_clicks") ?? 0;
        var gscImpressions = gsc?.GetValueOrDefault("gsc_impressions") ?? 0;

        var ga4Sessions = 0.0;
        if (!string.IsNullOrEmpty(url))
        {
            foreach (var (pathKey, ga) in sessionsByPath)
            {
                var key = pathKey;
                if (string.IsNullOrEmpty(key) || key == "/")
                {
                    continue;
                }

                if (url.EndsWith(key, StringComparison.Ordinal))
                {
                    ga4Sessions = Math.Max(ga4Sessions, ga.GetValueOrDefault("ga4_sessions"));
                }
            }
        }

        var impact = ComputeImpactScore(issue.Priority, gscClicks, ga4Sessions);
        return issue with
        {
            GscClicks = gscClicks,
            GscImpressions = gscImpressions,
            Ga4Sessions = ga4Sessions,
            ImpactScore = impact,
        };
    }

    private static (Dictionary<string, Dictionary<string, double>>, Dictionary<string, Dictionary<string, double>>) MetricsByUrl(
        IReadOnlyDictionary<string, object?>? googleData)
    {
        var clicks = new Dictionary<string, Dictionary<string, double>>(StringComparer.Ordinal);
        var sessions = new Dictionary<string, Dictionary<string, double>>(StringComparer.Ordinal);
        if (googleData is null)
        {
            return (clicks, sessions);
        }

        if (JsonObjectParser.AsDict(googleData.GetValueOrDefault("gsc")) is { } gsc)
        {
            foreach (var row in JsonObjectParser.AsDictRows(gsc.GetValueOrDefault("top_pages")))
            {
                var url = (row.GetValueOrDefault("page")?.ToString() ?? "").Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(url))
                {
                    continue;
                }

                clicks[url] = new Dictionary<string, double>
                {
                    ["gsc_clicks"] = ToDouble(row.GetValueOrDefault("clicks")),
                    ["gsc_impressions"] = ToDouble(row.GetValueOrDefault("impressions")),
                };
            }
        }

        if (JsonObjectParser.AsDict(googleData.GetValueOrDefault("ga4")) is { } ga4)
        {
            foreach (var row in JsonObjectParser.AsDictRows(ga4.GetValueOrDefault("top_pages")))
            {
                var path = (row.GetValueOrDefault("path")?.ToString() ?? "").Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(path))
                {
                    continue;
                }

                sessions[path] = new Dictionary<string, double>
                {
                    ["ga4_sessions"] = ToDouble(row.GetValueOrDefault("sessions")),
                };
            }
        }

        return (clicks, sessions);
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
