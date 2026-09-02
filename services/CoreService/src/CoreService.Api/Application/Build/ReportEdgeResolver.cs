using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build;

/// <summary>Choose internal link pairs for graph/categories (DB plot edges first, then crawl columns).</summary>
public static class ReportEdgeResolver
{
    public static IReadOnlyList<(string From, string To)> Resolve(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyList<(string From, string To)> crawlGraphEdges,
        IReadOnlyList<LinkEdgeRow> richLinkEdges)
    {
        if (crawlGraphEdges.Count > 0)
        {
            return crawlGraphEdges;
        }

        var fromRich = BuildUniqueInternalPairs(richLinkEdges);
        if (fromRich.Count > 0)
        {
            return fromRich;
        }

        return CategoryBuilder.BuildEdges(rows);
    }

    private static List<(string From, string To)> BuildUniqueInternalPairs(IReadOnlyList<LinkEdgeRow> rows)
    {
        var pairs = new HashSet<(string From, string To)>();
        foreach (var row in rows)
        {
            if (!string.Equals(row.LinkType, "internal", StringComparison.Ordinal))
            {
                continue;
            }

            var from = row.FromUrl.Trim();
            var to = row.ToUrl.Trim();
            if (string.IsNullOrEmpty(from) || string.IsNullOrEmpty(to))
            {
                continue;
            }

            pairs.Add((from, to));
        }

        return pairs.ToList();
    }
}
