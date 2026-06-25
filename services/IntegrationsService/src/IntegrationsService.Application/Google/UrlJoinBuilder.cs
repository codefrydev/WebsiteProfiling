using System.Text.Json.Serialization;

namespace IntegrationsService.Application.Google;

public static class UrlJoinBuilder
{
    public static string NormalizeUrl(string url)
    {
        url = url.Trim();
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed))
        {
            return url.ToLowerInvariant();
        }

        var host = StripWwwPrefix(parsed.Host.ToLowerInvariant());
        var path = parsed.AbsolutePath.TrimEnd('/');
        if (string.IsNullOrEmpty(path))
        {
            path = "/";
        }

        return $"{host}{path}";
    }

    public static string UrlToPath(string url)
    {
        try
        {
            return Uri.TryCreate(url, UriKind.Absolute, out var parsed)
                ? parsed.AbsolutePath.Length > 0 ? parsed.AbsolutePath : "/"
                : url;
        }
        catch
        {
            return url;
        }
    }

    public static string PathToUrl(string path, string startUrl)
    {
        try
        {
            if (!Uri.TryCreate(startUrl, UriKind.Absolute, out var parsed))
            {
                return path;
            }

            var origin = $"{parsed.Scheme}://{parsed.Host}";
            return origin + (path.StartsWith('/') ? path : "/" + path);
        }
        catch
        {
            return path;
        }
    }

    public static UrlJoinResult ComputeUrlJoin(
        IReadOnlyList<string> crawlUrls,
        IReadOnlyList<string> gscPages,
        IReadOnlyList<string> ga4Paths,
        string startUrl,
        IReadOnlyDictionary<string, JsonElementMetrics>? gscByPage = null,
        IReadOnlyDictionary<string, JsonElementMetrics>? ga4ByPath = null,
        int listLimit = 200)
    {
        var crawlNorm = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var u in crawlUrls)
        {
            if (string.IsNullOrWhiteSpace(u))
            {
                continue;
            }

            crawlNorm[NormalizeUrl(u)] = u;
        }

        var gscNorm = new Dictionary<string, (string Url, JsonElementMetrics Metrics)>(StringComparer.Ordinal);
        foreach (var url in gscPages)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                continue;
            }

            var gscMetrics = gscByPage is not null && gscByPage.TryGetValue(url, out var gm)
                ? gm
                : JsonElementMetrics.Empty;
            gscNorm[NormalizeUrl(url)] = (url, gscMetrics);
        }

        var ga4Norm = new Dictionary<string, (string Url, JsonElementMetrics Metrics)>(StringComparer.Ordinal);
        foreach (var path in ga4Paths)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            var full = PathToUrl(path, startUrl);
            var ga4Metrics = ga4ByPath is not null && ga4ByPath.TryGetValue(path, out var gm)
                ? gm
                : JsonElementMetrics.Empty;
            ga4Norm[NormalizeUrl(full)] = (full, ga4Metrics);
        }

        var crawlKeys = crawlNorm.Keys.ToHashSet(StringComparer.Ordinal);
        var gscKeys = gscNorm.Keys.ToHashSet(StringComparer.Ordinal);
        var ga4Keys = ga4Norm.Keys.ToHashSet(StringComparer.Ordinal);

        var matched = crawlKeys.Intersect(gscKeys.Union(ga4Keys)).Count();
        var crawlOnlyKeys = crawlKeys.Except(gscKeys).Except(ga4Keys).ToList();
        var gscOnlyKeys = gscKeys.Except(crawlKeys).ToList();
        var ga4OnlyKeys = ga4Keys.Except(crawlKeys).ToList();

        var crawlOnlyList = crawlOnlyKeys
            .Select(k => new UrlOnlyEntry { Url = crawlNorm[k] })
            .Take(listLimit)
            .ToList();

        var gscOnlySorted = gscOnlyKeys
            .Select(k =>
            {
                var (url, metrics) = gscNorm[k];
                return new GscOnlyEntry
                {
                    Url = url,
                    Clicks = metrics.Clicks,
                    Impressions = metrics.Impressions,
                };
            })
            .OrderByDescending(r => r.Impressions)
            .ToList();

        var ga4OnlySorted = ga4OnlyKeys
            .Select(k =>
            {
                var (url, metrics) = ga4Norm[k];
                return new Ga4OnlyEntry
                {
                    Url = url,
                    Sessions = metrics.Sessions,
                };
            })
            .OrderByDescending(r => r.Sessions)
            .ToList();

        var gscOnlyList = gscOnlySorted.Take(listLimit).ToList();
        var ga4OnlyList = ga4OnlySorted.Take(listLimit).ToList();

        return new UrlJoinResult
        {
            Matched = matched,
            CrawlOnly = crawlOnlyKeys.Count,
            GscOnly = gscOnlyKeys.Count,
            Ga4Only = ga4OnlyKeys.Count,
            Lists = new UrlJoinLists
            {
                CrawlOnly = crawlOnlyList,
                GscOnly = gscOnlyList,
                Ga4Only = ga4OnlyList,
            },
            ListsTotal = new UrlJoinListTotals
            {
                CrawlOnly = crawlOnlyKeys.Count,
                GscOnly = gscOnlySorted.Count,
                Ga4Only = ga4OnlySorted.Count,
            },
            ListLimit = listLimit,
        };
    }

    private static string StripWwwPrefix(string host) =>
        host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? host[4..] : host;
}

public sealed class JsonElementMetrics
{
    public static JsonElementMetrics Empty { get; } = new();

    public int Clicks { get; init; }

    public int Impressions { get; init; }

    public int Sessions { get; init; }
}

public sealed class UrlJoinResult
{
    public int Matched { get; init; }

    public int CrawlOnly { get; init; }

    public int GscOnly { get; init; }

    public int Ga4Only { get; init; }

    public UrlJoinLists Lists { get; init; } = new();

    public UrlJoinListTotals ListsTotal { get; init; } = new();

    public int ListLimit { get; init; }
}

public sealed class UrlJoinLists
{
    public IReadOnlyList<UrlOnlyEntry> CrawlOnly { get; init; } = [];

    public IReadOnlyList<GscOnlyEntry> GscOnly { get; init; } = [];

    public IReadOnlyList<Ga4OnlyEntry> Ga4Only { get; init; } = [];
}

public sealed class UrlJoinListTotals
{
    public int CrawlOnly { get; init; }

    public int GscOnly { get; init; }

    public int Ga4Only { get; init; }
}

public sealed class UrlOnlyEntry
{
    [JsonPropertyName("url")]
    public string Url { get; init; } = "";
}

public sealed class GscOnlyEntry
{
    [JsonPropertyName("url")]
    public string Url { get; init; } = "";

    [JsonPropertyName("clicks")]
    public int Clicks { get; init; }

    [JsonPropertyName("impressions")]
    public int Impressions { get; init; }
}

public sealed class Ga4OnlyEntry
{
    [JsonPropertyName("url")]
    public string Url { get; init; } = "";

    [JsonPropertyName("sessions")]
    public int Sessions { get; init; }
}
