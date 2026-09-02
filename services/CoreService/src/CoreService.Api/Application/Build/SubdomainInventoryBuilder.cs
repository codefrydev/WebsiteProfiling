using System.Net.Http.Headers;
using System.Text.Json;
using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build;

/// <summary>Port of Python reporting/subdomains.py passive subdomain inventory.</summary>
public sealed class SubdomainInventoryBuilder(IHttpClientFactory httpClientFactory)
{
    public async Task<Dictionary<string, object?>> BuildAsync(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, object?>? indexationCoverage,
        string startUrl,
        IReadOnlyDictionary<string, string>? config = null,
        CancellationToken cancellationToken = default)
    {
        var apex = ApexFromStartUrl(startUrl);
        if (!ParseBool(config, "enable_subdomain_discovery", defaultValue: true))
        {
            return new Dictionary<string, object?>
            {
                ["disabled"] = true,
                ["apex"] = apex,
                ["hosts"] = new List<object>(),
            };
        }

        var crawlCounts = CrawlHosts(rows);
        var (gscCounts, gscNotCrawledFromLists) = GscHosts(indexationCoverage);
        var hostMeta = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);

        foreach (var (host, count) in crawlCounts)
        {
            var meta = EnsureHost(hostMeta, host, apex);
            var sources = (List<string>)meta["sources"]!;
            if (!sources.Contains("crawl"))
            {
                sources.Add("crawl");
            }

            meta["in_crawl"] = true;
            meta["url_count_crawl"] = count;
        }

        foreach (var (host, count) in gscCounts)
        {
            var meta = EnsureHost(hostMeta, host, apex);
            var sources = (List<string>)meta["sources"]!;
            if (!sources.Contains("gsc"))
            {
                sources.Add("gsc");
            }

            meta["in_gsc"] = true;
            meta["url_count_gsc"] = Math.Max(Convert.ToInt32(meta["url_count_gsc"]), count);
        }

        string? crtshError = null;
        if (ParseBool(config, "subdomain_ct_lookup", defaultValue: true) && !string.IsNullOrEmpty(apex))
        {
            var (ctHosts, error) = await FetchCrtShHostsAsync(apex, cancellationToken);
            crtshError = error;
            foreach (var host in ctHosts)
            {
                var meta = EnsureHost(hostMeta, host, apex);
                var sources = (List<string>)meta["sources"]!;
                if (!sources.Contains("crtsh"))
                {
                    sources.Add("crtsh");
                }
            }
        }

        var gscHostsNotCrawled = hostMeta
            .Where(kvp => kvp.Value["in_gsc"] is true
                && kvp.Value["in_crawl"] is not true
                && kvp.Value["in_scope"] is true)
            .Select(kvp => kvp.Key)
            .Concat(gscNotCrawledFromLists)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(h => h, StringComparer.Ordinal)
            .ToList();

        var outOfScope = hostMeta
            .Where(kvp => kvp.Value["in_scope"] is not true)
            .Select(kvp => kvp.Key)
            .OrderBy(h => h, StringComparer.Ordinal)
            .ToList();

        var hosts = hostMeta.Values
            .OrderBy(h => h["host"]?.ToString(), StringComparer.Ordinal)
            .ToList();

        var result = new Dictionary<string, object?>
        {
            ["apex"] = apex,
            ["hosts"] = hosts,
            ["gsc_hosts_not_crawled"] = gscHostsNotCrawled,
            ["out_of_scope_discovered"] = outOfScope,
            ["fetched_at"] = DateTimeOffset.UtcNow.ToString("O"),
        };

        if (!string.IsNullOrEmpty(crtshError))
        {
            result["crtsh_error"] = crtshError;
        }

        return result;
    }

    internal static Dictionary<string, int> CrawlHosts(IReadOnlyList<CrawlRow> rows)
    {
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in CategoryHelpers.SuccessRows(rows))
        {
            var url = row.Url.Trim();
            if (string.IsNullOrEmpty(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri))
            {
                continue;
            }

            var host = uri.Host.ToLowerInvariant();
            if (string.IsNullOrEmpty(host))
            {
                continue;
            }

            counts[host] = counts.GetValueOrDefault(host) + 1;
        }

        return counts;
    }

    internal static (Dictionary<string, int> Counts, List<string> NotCrawledHosts) GscHosts(
        IReadOnlyDictionary<string, object?>? indexationCoverage)
    {
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var notCrawledHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (indexationCoverage is null)
        {
            return (counts, []);
        }

        if (indexationCoverage.TryGetValue("lists", out var listsObj)
            && listsObj is Dictionary<string, object?> lists
            && lists.TryGetValue("gsc_not_crawled", out var gscNotCrawledObj)
            && gscNotCrawledObj is IEnumerable<object?> gscNotCrawled)
        {
            foreach (var urlObj in gscNotCrawled)
            {
                var url = urlObj?.ToString()?.Trim() ?? "";
                if (string.IsNullOrEmpty(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri))
                {
                    continue;
                }

                var host = uri.Host.ToLowerInvariant();
                if (string.IsNullOrEmpty(host))
                {
                    continue;
                }

                notCrawledHosts.Add(host);
                counts[host] = counts.GetValueOrDefault(host) + 1;
            }
        }

        if (indexationCoverage.TryGetValue("url_join", out var urlJoinObj)
            && urlJoinObj is Dictionary<string, object?> urlJoin
            && urlJoin.TryGetValue("gsc_only", out var gscOnlyObj)
            && gscOnlyObj is IEnumerable<object?> gscOnlyRows)
        {
            foreach (var rowObj in gscOnlyRows)
            {
                var url = ExtractUrl(rowObj);
                if (string.IsNullOrEmpty(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri))
                {
                    continue;
                }

                var host = uri.Host.ToLowerInvariant();
                if (string.IsNullOrEmpty(host))
                {
                    continue;
                }

                counts[host] = counts.GetValueOrDefault(host) + 1;
            }
        }

        return (counts, notCrawledHosts.OrderBy(h => h, StringComparer.Ordinal).ToList());
    }

    internal static bool HostInScope(string host, string apex)
    {
        var h = StripWww(host);
        if (string.IsNullOrEmpty(h) || string.IsNullOrEmpty(apex))
        {
            return false;
        }

        return string.Equals(h, apex, StringComparison.OrdinalIgnoreCase)
            || h.EndsWith("." + apex, StringComparison.OrdinalIgnoreCase);
    }

    private async Task<(HashSet<string> Hosts, string? Error)> FetchCrtShHostsAsync(
        string apex,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(apex))
        {
            return ([], null);
        }

        var client = httpClientFactory.CreateClient(nameof(SubdomainInventoryBuilder));
        client.Timeout = TimeSpan.FromSeconds(8);
        if (!client.DefaultRequestHeaders.UserAgent.Any())
        {
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("WebsiteProfiling", "1.0"));
        }

        try
        {
            using var response = await client.GetAsync(
                $"https://crt.sh/?q=%25.{Uri.EscapeDataString(apex)}&output=json",
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return ([], $"crtsh: HTTP {(int)response.StatusCode}");
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return ([], "crtsh: unexpected response");
            }

            var hosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var row in doc.RootElement.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object
                    || !row.TryGetProperty("name_value", out var nameEl))
                {
                    continue;
                }

                var name = nameEl.GetString()?.Trim().ToLowerInvariant() ?? "";
                foreach (var part in name.Split('\n'))
                {
                    var cleaned = part.Trim().TrimStart('*', '.');
                    if (cleaned.Contains('.') && !string.IsNullOrEmpty(cleaned))
                    {
                        hosts.Add(cleaned);
                    }
                }
            }

            return (hosts, null);
        }
        catch (Exception ex)
        {
            return ([], $"crtsh: {ex.Message}");
        }
    }

    private static Dictionary<string, object?> EnsureHost(
        Dictionary<string, Dictionary<string, object?>> hostMeta,
        string host,
        string apex)
    {
        var h = host.ToLowerInvariant();
        if (!hostMeta.TryGetValue(h, out var meta))
        {
            meta = new Dictionary<string, object?>
            {
                ["host"] = h,
                ["sources"] = new List<string>(),
                ["in_crawl"] = false,
                ["in_gsc"] = false,
                ["url_count_crawl"] = 0,
                ["url_count_gsc"] = 0,
                ["in_scope"] = HostInScope(h, apex),
            };
            hostMeta[h] = meta;
        }

        return meta;
    }

    private static string ExtractUrl(object? rowObj)
    {
        if (rowObj is Dictionary<string, object?> dict)
        {
            if (dict.TryGetValue("url", out var urlObj) && urlObj is not null)
            {
                return urlObj.ToString()?.Trim() ?? "";
            }

            if (dict.TryGetValue("page", out var pageObj) && pageObj is not null)
            {
                return pageObj.ToString()?.Trim() ?? "";
            }
        }

        return rowObj?.ToString()?.Trim() ?? "";
    }

    private static string StripWww(string host)
    {
        var h = (host ?? "").Trim().ToLowerInvariant();
        return h.StartsWith("www.", StringComparison.Ordinal) ? h[4..] : h;
    }

    private static string ApexFromStartUrl(string startUrl)
    {
        if (!Uri.TryCreate(startUrl.Trim(), UriKind.Absolute, out var uri))
        {
            return "";
        }

        return StripWww(uri.Host);
    }

    private static bool ParseBool(IReadOnlyDictionary<string, string>? config, string key, bool defaultValue)
    {
        if (config is null || !config.TryGetValue(key, out var raw))
        {
            return defaultValue;
        }

        return raw.Trim().ToLowerInvariant() switch
        {
            "0" or "false" or "no" or "off" => false,
            "1" or "true" or "yes" or "on" => true,
            _ => defaultValue,
        };
    }
}
