using CoreService.Api.DataApplication.Dto.Portfolio;

namespace CoreService.Api.DataApplication.Portfolio;

internal static class PortfolioHistory
{
    public static Dictionary<string, IReadOnlyList<PortfolioCrawlHistoryPointDto>> BuildCrawlHistoryByDomain(
        IReadOnlyList<PortfolioCrawlSummaryRow> summaries)
    {
        var byDomain = new Dictionary<string, List<PortfolioCrawlHistoryPointDto>>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in summaries)
        {
            var key = PortfolioHelpers.ExtractHostname(row.StartUrl);
            if (string.IsNullOrEmpty(key)) continue;

            var pages = row.UrlCount;
            var point = new PortfolioCrawlHistoryPointDto
            {
                PagesDiscovered = pages,
                TitleCoverage = PortfolioHelpers.TitleCoveragePct(row.WithTitle, pages),
                AvgWordCount = row.AvgWordCount,
                CreatedAtMs = PortfolioHelpers.GeneratedAtMs(row.CreatedAt),
            };

            if (!byDomain.TryGetValue(key, out var list))
            {
                list = [];
                byDomain[key] = list;
            }

            list.Add(point);
        }

        return byDomain.ToDictionary(
            kv => kv.Key,
            kv => (IReadOnlyList<PortfolioCrawlHistoryPointDto>)kv.Value
                .OrderBy(p => p.CreatedAtMs)
                .TakeLast(8)
                .ToList(),
            StringComparer.OrdinalIgnoreCase);
    }
}
