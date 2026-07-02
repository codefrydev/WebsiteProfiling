using System.Text.Json.Nodes;

namespace ReportService.Application.Build;

/// <summary>
/// Pure Lighthouse merge helpers ported from Python reporting/lighthouse_report.py.
/// </summary>
public static class LighthouseReportMerge
{
    public static string? UrlHostname(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return "";
        }

        try
        {
            return Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri)
                ? uri.Host.ToLowerInvariant()
                : "";
        }
        catch (UriFormatException)
        {
            return "";
        }
    }

    public static string StripWww(string host)
    {
        var h = (host ?? "").Trim().ToLowerInvariant();
        return h.StartsWith("www.", StringComparison.Ordinal) ? h[4..] : h;
    }

    public static bool HostsMatch(string? a, string? b)
    {
        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b))
        {
            return false;
        }

        var al = a.ToLowerInvariant();
        var bl = b.ToLowerInvariant();
        return al == bl || StripWww(al) == StripWww(bl);
    }

    public static Dictionary<string, JsonNode> FilterLighthouseByHost(
        IReadOnlyDictionary<string, JsonNode> byUrl,
        string expectedHost)
    {
        if (byUrl.Count == 0 || string.IsNullOrWhiteSpace(expectedHost))
        {
            return byUrl.ToDictionary(kv => kv.Key, kv => kv.Value);
        }

        return byUrl
            .Where(kv => HostsMatch(UrlHostname(kv.Key), expectedHost))
            .ToDictionary(kv => kv.Key, kv => kv.Value);
    }

    public static JsonNode? LighthouseForUrl(IReadOnlyDictionary<string, JsonNode> byUrl, string? url)
    {
        if (byUrl.Count == 0 || string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        var normalized = url.Trim();
        if (byUrl.TryGetValue(normalized, out var direct))
        {
            return direct;
        }

        var trimmed = normalized.TrimEnd('/');
        if (byUrl.TryGetValue(trimmed, out var withoutSlash))
        {
            return withoutSlash;
        }

        if (byUrl.TryGetValue($"{trimmed}/", out var withSlash))
        {
            return withSlash;
        }

        return null;
    }

    public static string DeriveExpectedHost(string? startUrl, IEnumerable<string?> crawlUrls)
    {
        var host = UrlHostname(startUrl);
        if (!string.IsNullOrEmpty(host))
        {
            return host;
        }

        foreach (var u in crawlUrls)
        {
            var h = UrlHostname(u);
            if (!string.IsNullOrEmpty(h))
            {
                return h;
            }
        }

        return "";
    }

    public static JsonNode? PickLighthouseSummary(
        IReadOnlyDictionary<string, JsonNode> lighthouseByUrl,
        string? startUrl,
        JsonNode? globalSummary,
        string expectedHost)
    {
        if (lighthouseByUrl.Count > 0 && !string.IsNullOrWhiteSpace(startUrl))
        {
            var match = LighthouseForUrl(lighthouseByUrl, startUrl);
            if (match is not null)
            {
                return match;
            }
        }

        if (lighthouseByUrl.Count > 0)
        {
            return lighthouseByUrl.Values.First();
        }

        if (globalSummary is null)
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(expectedHost))
        {
            return globalSummary;
        }

        var summaryUrl = globalSummary["url"]?.GetValue<string>() ?? "";
        return HostsMatch(UrlHostname(summaryUrl), expectedHost) ? globalSummary : null;
    }
}
