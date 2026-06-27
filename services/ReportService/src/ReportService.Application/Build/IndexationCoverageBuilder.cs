using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/indexation.build_indexation_coverage.</summary>
public static class IndexationCoverageBuilder
{
    public static async Task<Dictionary<string, object?>> BuildAsync(
        IReadOnlyList<CrawlRow> rows,
        string startUrl,
        IReadOnlyDictionary<string, object?>? googleData,
        SitemapDiscoveryService sitemapDiscovery,
        int listLimit = 200,
        CancellationToken cancellationToken = default)
    {
        var crawlUrls = CategoryHelpers.SuccessRows(rows).Select(r => r.Url.Trim()).Where(u => u.Length > 0).ToList();
        var sitemapUrls = string.IsNullOrWhiteSpace(startUrl)
            ? []
            : (await sitemapDiscovery.DiscoverAsync(startUrl, cancellationToken: cancellationToken)).ToList();
        var gscPages = ExtractGscPageUrls(googleData);
        var gscByPage = ExtractGscByPage(googleData);

        var crawlNorm = UrlNormalizeHelper.ToNormalizedUrlMap(crawlUrls);
        var sitemapNorm = UrlNormalizeHelper.ToNormalizedUrlMap(sitemapUrls);
        var gscNorm = UrlNormalizeHelper.ToNormalizedUrlMap(gscPages);

        var sitemapOnlyNorm = sitemapNorm.Keys.Except(crawlNorm.Keys).ToHashSet(StringComparer.Ordinal);
        var crawledNotSitemapNorm = crawlNorm.Keys.Except(sitemapNorm.Keys).ToHashSet(StringComparer.Ordinal);
        var gscNotCrawledNorm = gscNorm.Keys.Except(crawlNorm.Keys).ToHashSet(StringComparer.Ordinal);

        var urlJoin = UrlJoinBuilder.Build(crawlUrls, gscPages, [], startUrl, gscByPage, listLimit);

        var (sitemapOnlyList, sitemapOnlyTotal) = Cap(
            sitemapOnlyNorm.OrderBy(k => k, StringComparer.Ordinal).Select(k => sitemapNorm[k]).ToList(),
            listLimit);
        var (crawledNotSitemapList, crawledNotSitemapTotal) = Cap(
            crawledNotSitemapNorm.OrderBy(k => k, StringComparer.Ordinal).Select(k => crawlNorm[k]).ToList(),
            listLimit);
        var (gscNotCrawledList, gscNotCrawledTotal) = Cap(
            gscNotCrawledNorm.OrderBy(k => k, StringComparer.Ordinal).Select(k => gscNorm[k]).ToList(),
            listLimit);

        var origin = "";
        if (Uri.TryCreate(startUrl, UriKind.Absolute, out var startUri))
        {
            origin = $"{startUri.Scheme}://{startUri.Authority}";
        }

        return new Dictionary<string, object?>
        {
            ["origin"] = origin,
            ["counts"] = new Dictionary<string, object?>
            {
                ["crawled"] = crawlNorm.Count,
                ["sitemap"] = sitemapNorm.Count,
                ["gsc_pages"] = gscNorm.Count,
                ["sitemap_only"] = sitemapOnlyTotal,
                ["crawled_not_in_sitemap"] = crawledNotSitemapTotal,
                ["gsc_not_crawled"] = gscNotCrawledTotal,
            },
            ["lists"] = new Dictionary<string, object?>
            {
                ["sitemap_only"] = sitemapOnlyList,
                ["crawled_not_in_sitemap"] = crawledNotSitemapList,
                ["gsc_not_crawled"] = gscNotCrawledList,
            },
            ["lists_total"] = new Dictionary<string, object?>
            {
                ["sitemap_only"] = sitemapOnlyTotal,
                ["crawled_not_in_sitemap"] = crawledNotSitemapTotal,
                ["gsc_not_crawled"] = gscNotCrawledTotal,
            },
            ["url_join"] = urlJoin,
            ["sitemap_urls"] = sitemapNorm.Keys.OrderBy(k => k, StringComparer.Ordinal)
                .Select(k => sitemapNorm[k])
                .Take(listLimit)
                .ToList(),
            ["sitemap_urls_total"] = sitemapNorm.Count,
        };
    }

    private static List<string> ExtractGscPageUrls(IReadOnlyDictionary<string, object?>? googleData)
    {
        if (JsonObjectParser.AsDict(googleData?.GetValueOrDefault("gsc")) is not { } gsc)
        {
            return [];
        }

        return JsonObjectParser.AsDictRows(gsc.GetValueOrDefault("top_pages"))
            .Select(r => r.GetValueOrDefault("page")?.ToString()?.Trim() ?? "")
            .Where(u => u.Length > 0)
            .ToList();
    }

    private static Dictionary<string, IReadOnlyDictionary<string, object?>> ExtractGscByPage(
        IReadOnlyDictionary<string, object?>? googleData)
    {
        var result = new Dictionary<string, IReadOnlyDictionary<string, object?>>(StringComparer.Ordinal);
        if (JsonObjectParser.AsDict(googleData?.GetValueOrDefault("gsc")) is not { } gsc)
        {
            return result;
        }

        foreach (var row in JsonObjectParser.AsDictRows(gsc.GetValueOrDefault("top_pages")))
        {
            var url = row.GetValueOrDefault("page")?.ToString()?.Trim() ?? "";
            if (url.Length > 0)
            {
                result[url] = row;
            }
        }

        return result;
    }

    private static (List<string> Items, int Total) Cap(List<string> items, int limit) =>
        (items.Take(Math.Max(1, limit)).ToList(), items.Count);
}
