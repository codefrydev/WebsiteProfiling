using System.Text.Json.Nodes;
using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build;

/// <summary>
/// Assembles per-URL Lighthouse data from DB rows (Python build_lighthouse_by_url parity).
/// </summary>
public static class LighthouseReportAssembler
{
    public static Dictionary<string, JsonNode> BuildLighthouseByUrl(
        IReadOnlyDictionary<string, JsonNode> dbSummaries,
        IReadOnlyList<CrawlRow> crawlRows,
        string? startUrl)
    {
        if (dbSummaries.Count == 0)
        {
            return new Dictionary<string, JsonNode>(StringComparer.Ordinal);
        }

        var expectedHost = LighthouseReportMerge.DeriveExpectedHost(
            startUrl,
            crawlRows.Select(r => r.Url));

        var filtered = LighthouseReportMerge.FilterLighthouseByHost(dbSummaries, expectedHost);
        var byUrl = new Dictionary<string, JsonNode>(StringComparer.Ordinal);

        foreach (var row in crawlRows)
        {
            var url = row.Url.Trim();
            var match = LighthouseReportMerge.LighthouseForUrl(filtered, url);
            if (match is not null)
            {
                byUrl[url] = match;
            }
        }

        if (byUrl.Count == 0 && filtered.Count > 0)
        {
            foreach (var kv in filtered)
            {
                byUrl[kv.Key.Trim()] = kv.Value;
            }
        }

        return byUrl;
    }
}
