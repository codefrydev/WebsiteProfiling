using System.Text.Json;

namespace CoreService.Api.IntegrationsApplication.Google;

public sealed class BingWebmasterService(IHttpClientFactory httpClientFactory)
{
    private const int MaxPages = 50;

    public async Task<IReadOnlyDictionary<string, object?>> FetchBacklinksSummaryAsync(
        string apiKey,
        string siteUrl,
        CancellationToken cancellationToken = default)
    {
        var key = (apiKey ?? "").Trim();
        var site = (siteUrl ?? "").Trim();
        if (string.IsNullOrEmpty(key) || string.IsNullOrEmpty(site))
        {
            return new Dictionary<string, object?>
            {
                ["ok"] = false,
                ["error"] = "Bing API key and site URL required",
                ["source"] = "bing_webmaster",
            };
        }

        var pages = new List<Dictionary<string, object?>>();
        var totalPages = 1;
        var page = 0;
        while (page < MaxPages)
        {
            var raw = await JsonGetAsync("GetLinkCounts", key, cancellationToken, ("siteUrl", site), ("page", page.ToString()));
            if (raw.TryGetValue("error", out var err) && err is not null)
            {
                if (page == 0)
                {
                    return new Dictionary<string, object?>
                    {
                        ["ok"] = false,
                        ["error"] = err.ToString(),
                        ["source"] = "bing_webmaster",
                        ["site_url"] = site,
                    };
                }

                break;
            }

            JsonElement payload = default;
            if (raw.TryGetValue("d", out var dObj) && dObj is JsonElement dEl && dEl.ValueKind == JsonValueKind.Object)
            {
                payload = dEl;
            }
            else if (raw.Count > 0)
            {
                using var tmp = JsonDocument.Parse(JsonSerializer.Serialize(raw));
                payload = tmp.RootElement;
            }

            if (payload.ValueKind == JsonValueKind.Object
                && payload.TryGetProperty("TotalPages", out var tp)
                && tp.TryGetInt32(out var tpInt))
            {
                totalPages = tpInt;
            }

            if (payload.ValueKind != JsonValueKind.Object
                || !payload.TryGetProperty("Links", out var links)
                || links.ValueKind != JsonValueKind.Array
                || links.GetArrayLength() == 0)
            {
                break;
            }

            foreach (var row in links.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                pages.Add(new Dictionary<string, object?>
                {
                    ["url"] = row.TryGetProperty("Url", out var url) ? url.GetString() : null,
                    ["inbound_links"] = row.TryGetProperty("Count", out var count) && count.TryGetInt32(out var c) ? c : 0,
                });
            }

            page++;
            if (page >= totalPages)
            {
                break;
            }
        }

        var totalInbound = pages.Sum(p => Convert.ToInt32(p.GetValueOrDefault("inbound_links") ?? 0));
        return new Dictionary<string, object?>
        {
            ["ok"] = true,
            ["source"] = "bing_webmaster",
            ["site_url"] = site,
            ["linked_pages"] = pages.Take(100).ToList(),
            ["linked_page_count"] = pages.Count,
            ["total_inbound_links"] = totalInbound,
            ["total_pages"] = totalPages,
            ["provenance"] = "Bing Webmaster",
        };
    }

    public async Task<BingBacklinksFetchResult> FetchBacklinksSummaryTypedAsync(
        string apiKey,
        string siteUrl,
        CancellationToken cancellationToken = default)
    {
        var raw = await FetchBacklinksSummaryAsync(apiKey, siteUrl, cancellationToken);
        if (raw.TryGetValue("ok", out var ok) && ok is false)
        {
            return new BingBacklinksFetchResult
            {
                Ok = false,
                Error = raw.GetValueOrDefault("error")?.ToString(),
                SiteUrl = siteUrl,
            };
        }

        return new BingBacklinksFetchResult
        {
            Ok = true,
            SiteUrl = raw.GetValueOrDefault("site_url")?.ToString() ?? siteUrl,
            TotalBacklinks = Convert.ToInt32(raw.GetValueOrDefault("total_inbound_links") ?? 0),
            ReferringDomains = Convert.ToInt32(raw.GetValueOrDefault("linked_page_count") ?? 0),
            LinkedPageCount = Convert.ToInt32(raw.GetValueOrDefault("linked_page_count") ?? 0),
        };
    }

    private async Task<Dictionary<string, object?>> JsonGetAsync(
        string method,
        string apiKey,
        CancellationToken cancellationToken,
        params (string Key, string Value)[] parameters)
    {
        var query = string.Join(
            "&",
            parameters
                .Append(("apikey", apiKey))
                .Select(p => $"{Uri.EscapeDataString(p.Item1)}={Uri.EscapeDataString(p.Item2)}"));
        var url = $"https://ssl.bing.com/webmaster/api.svc/json/{method}?{query}";
        var client = httpClientFactory.CreateClient(nameof(BingWebmasterService));

        try
        {
            using var response = await client.GetAsync(url, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
            return ObjectToDictionary(doc.RootElement);
        }
        catch (Exception ex)
        {
            return new Dictionary<string, object?> { ["error"] = ex.Message };
        }
    }

    private static Dictionary<string, object?> ObjectToDictionary(JsonElement value)
    {
        var dict = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (value.ValueKind != JsonValueKind.Object)
        {
            return dict;
        }

        foreach (var prop in value.EnumerateObject())
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
