using System.Text.Json;
using WebsiteProfiling.Contracts.Integrations;

namespace CoreService.Api.IntegrationsApplication.Google;

public static class PageLookupService
{
    public static PageSliceResult SliceFromGoogleRow(JsonElement raw, string pageUrl)
    {
        var gscBlob = GscFullBlob(raw);
        var ga4Blob = Ga4FullBlob(raw);
        var byPage = ReadObjectDict(gscBlob, "by_page");
        var byPath = ReadObjectDict(ga4Blob, "by_path");

        var gscPage = MatchGscPage(byPage, gscBlob, pageUrl);
        var ga4Page = MatchGa4Path(byPath, ga4Blob, pageUrl);

        var urlJoin = raw.TryGetProperty("url_join", out var uj) && uj.ValueKind == JsonValueKind.Object
            ? uj
            : default;
        var norm = UrlJoinBuilder.NormalizeUrl(pageUrl);
        var inGsc = gscPage is not null;
        var inGa4 = ga4Page is not null;
        const bool inCrawl = false;

        if (urlJoin.ValueKind == JsonValueKind.Object
            && urlJoin.TryGetProperty("lists", out var lists)
            && lists.ValueKind == JsonValueKind.Object)
        {
            foreach (var cat in new[] { "crawl_only", "gsc_only", "ga4_only" })
            {
                if (!lists.TryGetProperty(cat, out var items) || items.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var item in items.EnumerateArray())
                {
                    var u = item.ValueKind == JsonValueKind.Object && item.TryGetProperty("url", out var urlEl)
                        ? urlEl.GetString()
                        : item.ValueKind == JsonValueKind.String ? item.GetString() : null;
                    if (string.IsNullOrEmpty(u) || UrlJoinBuilder.NormalizeUrl(u) != norm)
                    {
                        continue;
                    }

                    if (cat == "gsc_only")
                    {
                        inGsc = true;
                    }
                    else if (cat == "ga4_only")
                    {
                        inGa4 = true;
                    }

                    break;
                }
            }
        }

        var dateRange = raw.TryGetProperty("date_range", out var dr) && dr.ValueKind == JsonValueKind.Object
            ? ObjectToDictionary(dr)
            : new Dictionary<string, object?>();

        if (!dateRange.ContainsKey("start")
            && gscBlob.TryGetProperty("date_start", out var ds)
            && ds.ValueKind == JsonValueKind.String)
        {
            dateRange["start"] = ds.GetString();
            if (gscBlob.TryGetProperty("date_end", out var de) && de.ValueKind == JsonValueKind.String)
            {
                dateRange["end"] = de.GetString();
            }
        }

        var fetchedAt = raw.TryGetProperty("fetched_at", out var fa) ? JsonElementToObject(fa) : null;

        return new PageSliceResult
        {
            Source = "snapshot",
            Gsc = gscPage is { ValueKind: JsonValueKind.Object } gscEl ? PublicGscPage(gscEl) : null,
            Ga4 = ga4Page is { ValueKind: JsonValueKind.Object } ga4El ? PublicGa4Page(ga4El) : null,
            Coverage = new PageCoverage
            {
                InCrawl = inCrawl,
                InGsc = inGsc,
                InGa4 = inGa4,
            },
            SiteBenchmarks = new PageSiteBenchmarks
            {
                Gsc = gscBlob.TryGetProperty("summary", out var gs) ? JsonElementToObject(gs) : null,
                Ga4 = ga4Blob.TryGetProperty("summary", out var gas) ? JsonElementToObject(gas) : null,
            },
            DateRange = dateRange,
            FetchedAt = fetchedAt?.ToString(),
            Typed = PageLookupMapper.ToPageLookupResult(pageUrl, gscPage, ga4Page),
        };
    }

    public static Dictionary<string, object?> SummaryFromSlice(object? gsc, object? ga4)
    {
        var gscDict = gsc as Dictionary<string, object?>;
        var ga4Dict = ga4 as Dictionary<string, object?>;
        return new Dictionary<string, object?>
        {
            ["gsc"] = gscDict is null
                ? null
                : new Dictionary<string, object?>
                {
                    ["clicks"] = gscDict.GetValueOrDefault("clicks"),
                    ["impressions"] = gscDict.GetValueOrDefault("impressions"),
                    ["position"] = gscDict.GetValueOrDefault("position"),
                },
            ["ga4"] = ga4Dict is null
                ? null
                : new Dictionary<string, object?>
                {
                    ["sessions"] = ga4Dict.GetValueOrDefault("sessions"),
                    ["engagementRate"] = ga4Dict.GetValueOrDefault("engagementRate"),
                },
        };
    }

    public static object? ReadOptionalObject(JsonElement root, string key)
    {
        return root.TryGetProperty(key, out var value) ? JsonElementToObject(value) : null;
    }

    public static Dictionary<string, object?>? PublicGscPageFromDict(Dictionary<string, object?>? page)
    {
        if (page is null)
        {
            return null;
        }

        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(page));
        return PublicGscPage(doc.RootElement);
    }

    public static Dictionary<string, object?>? PublicGa4PageFromDict(Dictionary<string, object?>? page)
    {
        if (page is null)
        {
            return null;
        }

        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(page));
        return PublicGa4Page(doc.RootElement);
    }

    private static JsonElement GscFullBlob(JsonElement raw)
    {
        if (raw.TryGetProperty("gsc_full", out var full) && full.ValueKind == JsonValueKind.Object)
        {
            return full;
        }

        return raw.TryGetProperty("gsc", out var gsc) && gsc.ValueKind == JsonValueKind.Object ? gsc : default;
    }

    private static JsonElement Ga4FullBlob(JsonElement raw)
    {
        if (raw.TryGetProperty("ga4_full", out var full) && full.ValueKind == JsonValueKind.Object)
        {
            return full;
        }

        return raw.TryGetProperty("ga4", out var ga4) && ga4.ValueKind == JsonValueKind.Object ? ga4 : default;
    }

    private static Dictionary<string, JsonElement> ReadObjectDict(JsonElement blob, string key)
    {
        var result = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (blob.ValueKind != JsonValueKind.Object
            || !blob.TryGetProperty(key, out var map)
            || map.ValueKind != JsonValueKind.Object)
        {
            return result;
        }

        foreach (var prop in map.EnumerateObject())
        {
            result[prop.Name] = prop.Value;
        }

        return result;
    }

    private static JsonElement? MatchGscPage(
        Dictionary<string, JsonElement> byPage,
        JsonElement gscBlob,
        string pageUrl)
    {
        if (byPage.TryGetValue(pageUrl, out var direct))
        {
            return direct;
        }

        var norm = UrlJoinBuilder.NormalizeUrl(pageUrl);
        foreach (var (key, val) in byPage)
        {
            if (UrlJoinBuilder.NormalizeUrl(key) == norm)
            {
                return val;
            }
        }

        if (gscBlob.TryGetProperty("top_pages", out var topPages) && topPages.ValueKind == JsonValueKind.Array)
        {
            foreach (var row in topPages.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object
                    || !row.TryGetProperty("page", out var pageEl))
                {
                    continue;
                }

                if (UrlJoinBuilder.NormalizeUrl(pageEl.GetString() ?? "") == norm)
                {
                    return row;
                }
            }
        }

        return null;
    }

    private static JsonElement? MatchGa4Path(
        Dictionary<string, JsonElement> byPath,
        JsonElement ga4Blob,
        string pageUrl)
    {
        var path = UrlJoinBuilder.UrlToPath(pageUrl);
        if (byPath.TryGetValue(path, out var direct))
        {
            return direct;
        }

        var norm = UrlJoinBuilder.NormalizeUrl(pageUrl);
        foreach (var (p, val) in byPath)
        {
            if (val.ValueKind == JsonValueKind.Object
                && val.TryGetProperty("full_url", out var full)
                && !string.IsNullOrEmpty(full.GetString())
                && UrlJoinBuilder.NormalizeUrl(full.GetString()!) == norm)
            {
                return val;
            }

            if (UrlJoinBuilder.NormalizeUrl(p) == norm || p == path)
            {
                return val;
            }
        }

        if (ga4Blob.TryGetProperty("top_pages", out var topPages) && topPages.ValueKind == JsonValueKind.Array)
        {
            foreach (var row in topPages.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var fu = row.TryGetProperty("full_url", out var fullUrlEl) ? fullUrlEl.GetString() : "";
                if (!string.IsNullOrEmpty(fu) && UrlJoinBuilder.NormalizeUrl(fu) == norm)
                {
                    return row;
                }

                if (row.TryGetProperty("path", out var pathEl)
                    && UrlJoinBuilder.NormalizeUrl(pathEl.GetString() ?? "") == norm)
                {
                    return row;
                }
            }
        }

        return null;
    }

    private static Dictionary<string, object?>? PublicGscPage(JsonElement page)
    {
        if (page.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var p = page;
        var queries = new List<Dictionary<string, object?>>();
        if (p.TryGetProperty("queries", out var qArr) && qArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var q in qArr.EnumerateArray())
            {
                if (q.ValueKind == JsonValueKind.Object)
                {
                    queries.Add(ObjectToDictionary(q));
                }
            }
        }

        queries = queries
            .OrderByDescending(q => Convert.ToInt32(q.GetValueOrDefault("impressions") ?? 0))
            .Take(25)
            .ToList();

        return new Dictionary<string, object?>
        {
            ["page"] = p.TryGetProperty("page", out var pageEl) ? pageEl.GetString() : null,
            ["clicks"] = ReadInt(p, "clicks"),
            ["impressions"] = ReadInt(p, "impressions"),
            ["ctr"] = ReadDouble(p, "ctr"),
            ["position"] = ReadDouble(p, "position"),
            ["queries"] = queries,
        };
    }

    private static Dictionary<string, object?>? PublicGa4Page(JsonElement page)
    {
        if (page.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var p = page;
        return new Dictionary<string, object?>
        {
            ["path"] = p.TryGetProperty("path", out var pathEl) ? pathEl.GetString() : null,
            ["full_url"] = p.TryGetProperty("full_url", out var fullEl) ? fullEl.GetString() : null,
            ["sessions"] = ReadInt(p, "sessions"),
            ["activeUsers"] = p.TryGetProperty("activeUsers", out var au) ? ReadInt(p, "activeUsers") : ReadInt(p, "active_users"),
            ["screenPageViews"] = p.TryGetProperty("screenPageViews", out _) ? ReadInt(p, "screenPageViews") : ReadInt(p, "screen_page_views"),
            ["engagementRate"] = ReadDouble(p, "engagementRate"),
            ["avgSessionDuration"] = p.TryGetProperty("avgSessionDuration", out _) ? ReadDouble(p, "avgSessionDuration") : ReadDouble(p, "avg_session_duration"),
        };
    }

    private static int ReadInt(JsonElement obj, string key) =>
        obj.TryGetProperty(key, out var v) && v.TryGetInt32(out var i) ? i : 0;

    private static double ReadDouble(JsonElement obj, string key) =>
        obj.TryGetProperty(key, out var v) && v.TryGetDouble(out var d) ? d : 0.0;

    private static Dictionary<string, object?> ObjectToDictionary(JsonElement obj)
    {
        var dict = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var prop in obj.EnumerateObject())
        {
            dict[prop.Name] = JsonElementToObject(prop.Value);
        }

        return dict;
    }

    private static object? JsonElementToObject(JsonElement value) =>
        value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.TryGetInt64(out var l) ? l : value.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            JsonValueKind.Array => value.EnumerateArray().Select(JsonElementToObject).ToList(),
            JsonValueKind.Object => ObjectToDictionary(value),
            _ => value.GetRawText(),
        };
}

public sealed class PageSliceResult
{
    public string Source { get; init; } = "snapshot";

    public object? Gsc { get; init; }

    public object? Ga4 { get; init; }

    public PageCoverage Coverage { get; init; } = new();

    public PageSiteBenchmarks SiteBenchmarks { get; init; } = new();

    public Dictionary<string, object?> DateRange { get; init; } = [];

    public string? FetchedAt { get; init; }

    public PageLookupResult? Typed { get; init; }
}

public sealed class PageCoverage
{
    public bool InCrawl { get; init; }

    public bool InGsc { get; init; }

    public bool InGa4 { get; init; }
}

public sealed class PageSiteBenchmarks
{
    public object? Gsc { get; init; }

    public object? Ga4 { get; init; }
}
