using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace CoreService.Api.DataApplication.Portfolio;

internal static partial class PortfolioHelpers
{
    private static readonly Regex SlugifyRegex = SlugifyPattern();

    public static string ExtractHostname(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return "";
        try
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
                return "";
            return uri.Host.ToLowerInvariant();
        }
        catch
        {
            return "";
        }
    }

    public static string SlugifyDomain(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "";
        return SlugifyRegex.Replace(name.Trim().ToLowerInvariant(), "-").Trim('-');
    }

    public static string ToDisplayDateTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        try
        {
            var normalized = value.Replace("Z", "+00:00", StringComparison.Ordinal);
            if (DateTimeOffset.TryParse(normalized, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dto))
                return dto.ToString("O");
        }
        catch { /* fall through */ }
        return value;
    }

    public static double GeneratedAtMs(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return 0;
        try
        {
            var normalized = value.Replace("Z", "+00:00", StringComparison.Ordinal);
            if (DateTimeOffset.TryParse(normalized, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dto))
                return dto.ToUnixTimeMilliseconds();
        }
        catch { /* fall through */ }
        return 0;
    }

    public static int TitleCoveragePct(int withTitle, int urlCount) =>
        urlCount <= 0 ? 0 : (int)Math.Round(withTitle / (double)urlCount * 100, MidpointRounding.ToEven);

    public static int? RoundScore(double? value) =>
        value is null ? null : (int)Math.Round(value.Value, MidpointRounding.ToEven);

    public static JsonElement? GetObj(JsonElement root, string name) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty(name, out var val) ? val : null;

    public static JsonElement GetArrayOrEmpty(JsonElement root, string name)
    {
        if (root.ValueKind != JsonValueKind.Object) return default;
        return root.TryGetProperty(name, out var val) && val.ValueKind == JsonValueKind.Array ? val : default;
    }

    public static string GetString(JsonElement el, string name, string fallback = "")
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var val)) return fallback;
        return val.ValueKind == JsonValueKind.String ? val.GetString() ?? fallback : fallback;
    }

    public static int GetInt(JsonElement el, string name, int fallback = 0)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var val)) return fallback;
        if (val.ValueKind == JsonValueKind.Number && val.TryGetInt32(out var n)) return n;
        if (val.ValueKind == JsonValueKind.String && int.TryParse(val.GetString(), out var s)) return s;
        return fallback;
    }

    public static double? GetDoubleOrNull(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var val)) return null;
        if (val.ValueKind == JsonValueKind.Number) return val.GetDouble();
        return null;
    }

    public static int ArrayLength(JsonElement el)
    {
        if (el.ValueKind == JsonValueKind.Array) return el.GetArrayLength();
        return 0;
    }

    public static string FirstUrlFromPagesOrLinks(JsonElement payload)
    {
        var top = GetArrayOrEmpty(payload, "top_pages");
        if (top.ValueKind == JsonValueKind.Array && top.GetArrayLength() > 0)
        {
            var first = top[0];
            if (first.ValueKind == JsonValueKind.Object)
                return GetString(first, "url");
        }

        var links = GetArrayOrEmpty(payload, "links");
        if (links.ValueKind == JsonValueKind.Array && links.GetArrayLength() > 0)
        {
            var first = links[0];
            if (first.ValueKind == JsonValueKind.Object)
                return GetString(first, "url");
        }

        return "";
    }

    public static string CanonicalDomainFromPayload(JsonElement payload, IReadOnlyDictionary<long, string> startUrlByRunId)
    {
        long? runId = null;
        if (payload.TryGetProperty("crawl_run_id", out var rid) && rid.ValueKind == JsonValueKind.Number)
            runId = rid.TryGetInt64(out var l) ? l : rid.GetInt32();

        var runStart = runId is not null && startUrlByRunId.TryGetValue(runId.Value, out var s) ? s : "";
        var fallback = FirstUrlFromPagesOrLinks(payload);
        var startDomain = ExtractHostname(runStart);
        var fallbackDomain = ExtractHostname(fallback);
        return (startDomain.Length > 0 ? startDomain : fallbackDomain).ToLowerInvariant();
    }

    public static int CrawledUrlCount(JsonElement payload)
    {
        var meta = GetObj(payload, "report_meta");
        if (meta is { } m && m.TryGetProperty("crawl_scope", out var scope) &&
            scope.ValueKind == JsonValueKind.Object &&
            scope.TryGetProperty("pages_crawled", out var pages) && pages.ValueKind == JsonValueKind.Number)
        {
            var n = pages.TryGetInt32(out var i) ? i : (int)pages.GetDouble();
            if (n > 0) return n;
        }

        var summary = GetObj(payload, "summary");
        if (summary is { } s)
        {
            var total = GetDoubleOrNull(s, "total_urls");
            if (total is > 0) return (int)total.Value;
        }

        return ArrayLength(GetArrayOrEmpty(payload, "links"));
    }

    public static JsonNode? BuildCrawlConfigFromPayload(JsonElement payload, JsonElement? runMeta)
    {
        JsonObject? cfg = null;
        var meta = GetObj(payload, "report_meta");
        if (meta is { } m && m.TryGetProperty("crawl_scope", out var scope) &&
            scope.ValueKind == JsonValueKind.Object)
        {
            cfg = JsonNode.Parse(scope.GetRawText()) as JsonObject ?? new JsonObject();
        }

        var hasRunMeta = runMeta is { ValueKind: JsonValueKind.Object } rm &&
                         (rm.TryGetProperty("render_mode", out var rmVal) && rmVal.ValueKind != JsonValueKind.Null ||
                          rm.TryGetProperty("discovery_mode", out var dmVal) && dmVal.ValueKind != JsonValueKind.Null);

        if (cfg is null && !hasRunMeta) return null;

        cfg ??= new JsonObject();

        if (runMeta is { ValueKind: JsonValueKind.Object } metaEl)
        {
            if (metaEl.TryGetProperty("render_mode", out var render) && render.ValueKind == JsonValueKind.String &&
                !cfg.ContainsKey("render_mode"))
                cfg["render_mode"] = render.GetString();
            if (metaEl.TryGetProperty("discovery_mode", out var disc) && disc.ValueKind == JsonValueKind.String)
                cfg["discovery_mode"] = disc.GetString();
        }

        return cfg.Count > 0 ? cfg : null;
    }

    public static JsonNode? BuildCrawlConfigFromSummary(
        string? renderMode, string? discoveryMode, int urlCount)
    {
        if (string.IsNullOrEmpty(renderMode) && string.IsNullOrEmpty(discoveryMode) && urlCount == 0)
            return null;

        return new JsonObject
        {
            ["pages_crawled"] = urlCount,
            ["render_mode"] = renderMode,
            ["discovery_mode"] = discoveryMode,
        };
    }

    [GeneratedRegex("[^a-z0-9]+", RegexOptions.CultureInvariant)]
    private static partial Regex SlugifyPattern();
}
