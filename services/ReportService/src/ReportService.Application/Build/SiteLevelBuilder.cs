using System.Net.Http.Headers;
using System.Text.Json;

namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/site_level.py and site_files.py fetch helpers.</summary>
public sealed class SiteLevelBuilder(IHttpClientFactory httpClientFactory)
{
    private const int DefaultTimeoutSeconds = 8;

    public async Task<Dictionary<string, object?>> FetchAsync(
        string startUrl,
        CancellationToken cancellationToken = default)
    {
        if (!Uri.TryCreate(startUrl.Trim(), UriKind.Absolute, out var startUri)
            || string.IsNullOrEmpty(startUri.Scheme)
            || string.IsNullOrEmpty(startUri.Host))
        {
            return DefaultMissing();
        }

        var origin = $"{startUri.Scheme}://{startUri.Authority}";
        var client = httpClientFactory.CreateClient(nameof(SiteLevelBuilder));
        client.Timeout = TimeSpan.FromSeconds(DefaultTimeoutSeconds);
        if (!client.DefaultRequestHeaders.UserAgent.Any())
        {
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("WebsiteProfiling", "1.0"));
        }

        var outDict = new Dictionary<string, object?>
        {
            ["robots_present"] = false,
            ["sitemap_present"] = false,
            ["sitemap_valid"] = false,
        };

        try
        {
            using var robotsResponse = await client.GetAsync($"{origin}/robots.txt", cancellationToken);
            if (robotsResponse.IsSuccessStatusCode)
            {
                var robots = await robotsResponse.Content.ReadAsStringAsync(cancellationToken);
                if (!string.IsNullOrWhiteSpace(robots))
                {
                    outDict["robots_present"] = true;
                }
            }
        }
        catch (HttpRequestException)
        {
            // optional
        }

        try
        {
            using var sitemapResponse = await client.GetAsync($"{origin}/sitemap.xml", cancellationToken);
            if (sitemapResponse.IsSuccessStatusCode)
            {
                var sitemap = await sitemapResponse.Content.ReadAsStringAsync(cancellationToken);
                if (!string.IsNullOrWhiteSpace(sitemap))
                {
                    outDict["sitemap_present"] = true;
                    outDict["sitemap_valid"] = sitemap.Contains('<')
                        && sitemap.Contains('>')
                        && (sitemap.Contains("urlset", StringComparison.OrdinalIgnoreCase)
                            || sitemap.Contains("sitemapindex", StringComparison.OrdinalIgnoreCase));
                }
            }
        }
        catch (HttpRequestException)
        {
            // optional
        }

        SiteFileParser.MergeSiteFileFields(outDict, await FetchAdsTxtAsync(client, origin, cancellationToken));
        SiteFileParser.MergeSiteFileFields(outDict, await FetchSecurityTxtAsync(client, origin, cancellationToken));
        return outDict;
    }

    public async Task<string?> FetchRdapOrgNameAsync(
        string domain,
        CancellationToken cancellationToken = default)
    {
        var apex = domain.Trim().ToLowerInvariant();
        if (apex.StartsWith("www.", StringComparison.Ordinal))
        {
            apex = apex[4..];
        }

        if (string.IsNullOrEmpty(apex) || !apex.Contains('.'))
        {
            return null;
        }

        var client = httpClientFactory.CreateClient(nameof(SiteLevelBuilder));
        client.Timeout = TimeSpan.FromSeconds(DefaultTimeoutSeconds);
        client.DefaultRequestHeaders.Accept.Clear();
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/rdap+json"));

        try
        {
            using var response = await client.GetAsync($"https://rdap.org/domain/{apex}", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!doc.RootElement.TryGetProperty("entities", out var entities)
                || entities.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            foreach (var ent in entities.EnumerateArray())
            {
                if (ent.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                if (ent.TryGetProperty("roles", out var rolesEl) && rolesEl.ValueKind == JsonValueKind.Array)
                {
                    var roles = rolesEl.EnumerateArray()
                        .Select(r => r.GetString()?.ToLowerInvariant() ?? "")
                        .ToList();
                    if (roles.Count > 0 && !roles.Contains("registrant"))
                    {
                        continue;
                    }
                }

                if (!ent.TryGetProperty("vcardArray", out var vcard)
                    || vcard.ValueKind != JsonValueKind.Array
                    || vcard.GetArrayLength() < 2)
                {
                    continue;
                }

                foreach (var row in vcard.EnumerateArray().Skip(1))
                {
                    if (row.ValueKind != JsonValueKind.Array || row.GetArrayLength() < 4)
                    {
                        continue;
                    }

                    var field = row[0].GetString()?.ToLowerInvariant() ?? "";
                    if (field is not ("fn" or "org"))
                    {
                        continue;
                    }

                    var val = row[3].GetString()?.Trim();
                    if (!string.IsNullOrEmpty(val))
                    {
                        return val;
                    }
                }
            }
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }

        return null;
    }

    private static Dictionary<string, object?> DefaultMissing() =>
        new()
        {
            ["robots_present"] = false,
            ["sitemap_present"] = false,
            ["sitemap_valid"] = false,
            ["ads_txt_present"] = false,
            ["security_txt_present"] = false,
        };

    private static async Task<Dictionary<string, object?>> FetchAdsTxtAsync(
        HttpClient client,
        string origin,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await client.GetAsync($"{origin}/ads.txt", cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                var text = await response.Content.ReadAsStringAsync(cancellationToken);
                if (!string.IsNullOrWhiteSpace(text))
                {
                    return SiteFileParser.ParseAdsTxt(text);
                }
            }
        }
        catch (HttpRequestException)
        {
            // optional
        }

        return SiteFileParser.ParseAdsTxt("");
    }

    private static async Task<Dictionary<string, object?>> FetchSecurityTxtAsync(
        HttpClient client,
        string origin,
        CancellationToken cancellationToken)
    {
        foreach (var path in new[] { "/.well-known/security.txt", "/security.txt" })
        {
            try
            {
                using var response = await client.GetAsync($"{origin}{path}", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var text = await response.Content.ReadAsStringAsync(cancellationToken);
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        return SiteFileParser.ParseSecurityTxt(text);
                    }
                }
            }
            catch (HttpRequestException)
            {
                // try next path
            }
        }

        return SiteFileParser.ParseSecurityTxt("");
    }
}
