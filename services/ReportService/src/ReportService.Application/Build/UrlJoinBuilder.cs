namespace ReportService.Application.Build;

/// <summary>Port of Python compute_url_join.</summary>
public static class UrlJoinBuilder
{
    public static Dictionary<string, object?> Build(
        IReadOnlyList<string> crawlUrls,
        IReadOnlyList<string> gscPages,
        IReadOnlyList<string> ga4Paths,
        string startUrl,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, object?>>? gscByPage = null,
        int listLimit = 200)
    {
        gscByPage ??= new Dictionary<string, IReadOnlyDictionary<string, object?>>(StringComparer.Ordinal);

        var crawlNorm = UrlNormalizeHelper.ToNormalizedUrlMap(crawlUrls);

        var gscNorm = new Dictionary<string, (string Url, IReadOnlyDictionary<string, object?> Metrics)>(StringComparer.Ordinal);
        foreach (var url in gscPages.Where(u => !string.IsNullOrWhiteSpace(u)))
        {
            gscByPage.TryGetValue(url, out var metrics);
            gscNorm[UrlNormalizeHelper.NormalizeUrl(url)] = (url, metrics ?? new Dictionary<string, object?>());
        }

        var ga4Norm = new Dictionary<string, (string Url, IReadOnlyDictionary<string, object?> Metrics)>(StringComparer.Ordinal);
        foreach (var path in ga4Paths.Where(p => !string.IsNullOrWhiteSpace(p)))
        {
            var full = UrlNormalizeHelper.PathToUrl(path, startUrl);
            ga4Norm[UrlNormalizeHelper.NormalizeUrl(full)] = (full, new Dictionary<string, object?>());
        }

        var crawlKeys = crawlNorm.Keys.ToHashSet(StringComparer.Ordinal);
        var gscKeys = gscNorm.Keys.ToHashSet(StringComparer.Ordinal);
        var ga4Keys = ga4Norm.Keys.ToHashSet(StringComparer.Ordinal);

        var matched = crawlKeys.Count(k => gscKeys.Contains(k) || ga4Keys.Contains(k));
        var crawlOnlyKeys = crawlKeys.Except(gscKeys).Except(ga4Keys).ToList();
        var gscOnlyKeys = gscKeys.Except(crawlKeys).ToList();
        var ga4OnlyKeys = ga4Keys.Except(crawlKeys).ToList();

        var crawlOnlyList = Cap(
            crawlOnlyKeys.Select(k => new Dictionary<string, object?> { ["url"] = crawlNorm[k] }).ToList(),
            listLimit);
        var gscOnlySorted = gscOnlyKeys
            .Select(k =>
            {
                var (url, metrics) = gscNorm[k];
                return new Dictionary<string, object?>
                {
                    ["url"] = url,
                    ["clicks"] = ToInt(metrics.GetValueOrDefault("clicks")),
                    ["impressions"] = ToInt(metrics.GetValueOrDefault("impressions")),
                };
            })
            .OrderByDescending(r => Convert.ToInt32(r["impressions"]))
            .ToList();
        var gscOnlyList = Cap(gscOnlySorted, listLimit);

        var ga4OnlySorted = ga4OnlyKeys
            .Select(k =>
            {
                var (url, metrics) = ga4Norm[k];
                return new Dictionary<string, object?>
                {
                    ["url"] = url,
                    ["sessions"] = ToInt(metrics.GetValueOrDefault("sessions")),
                };
            })
            .OrderByDescending(r => Convert.ToInt32(r["sessions"]))
            .ToList();
        var ga4OnlyList = Cap(ga4OnlySorted, listLimit);

        return new Dictionary<string, object?>
        {
            ["matched"] = matched,
            ["crawl_only"] = crawlOnlyKeys.Count,
            ["gsc_only"] = gscOnlyKeys.Count,
            ["ga4_only"] = ga4OnlyKeys.Count,
            ["lists"] = new Dictionary<string, object?>
            {
                ["crawl_only"] = crawlOnlyList.Items,
                ["gsc_only"] = gscOnlyList.Items,
                ["ga4_only"] = ga4OnlyList.Items,
            },
            ["lists_total"] = new Dictionary<string, object?>
            {
                ["crawl_only"] = crawlOnlyList.Total,
                ["gsc_only"] = gscOnlyList.Total,
                ["ga4_only"] = ga4OnlyList.Total,
            },
            ["list_limit"] = listLimit,
        };
    }

    private static (List<Dictionary<string, object?>> Items, int Total) Cap(
        List<Dictionary<string, object?>> items,
        int limit)
    {
        var total = items.Count;
        return (items.Take(Math.Max(1, limit)).ToList(), total);
    }

    private static int ToInt(object? value) => value switch
    {
        null => 0,
        int i => i,
        long l => (int)l,
        double d => (int)d,
        float f => (int)f,
        string s when int.TryParse(s, out var n) => n,
        _ => 0,
    };
}
