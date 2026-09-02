using CoreService.Api.DataApplication.Dto.Portfolio;

namespace CoreService.Api.DataApplication.Portfolio;

internal sealed class PortfolioMaps
{
    public required IReadOnlyDictionary<long, string> StartUrlByRunId { get; init; }
    public required IReadOnlyDictionary<long, string> RunCreatedAtByRunId { get; init; }
    public required IReadOnlyDictionary<long, CrawlRunMeta> RunMetaByRunId { get; init; }
    public required IReadOnlyList<PortfolioCrawlSummaryRow> CrawlSummaries { get; init; }

    public sealed class CrawlRunMeta
    {
        public string? RenderMode { get; init; }
        public string? DiscoveryMode { get; init; }
    }

    public static PortfolioMaps Load(
        IReadOnlyList<PortfolioCrawlRunRow> crawlRows,
        IReadOnlyList<PortfolioCrawlSummaryRow> crawlSummaries)
    {
        var startUrl = new Dictionary<long, string>();
        var createdAt = new Dictionary<long, string>();
        var meta = new Dictionary<long, CrawlRunMeta>();

        foreach (var row in crawlRows)
        {
            startUrl[row.Id] = row.StartUrl;
            createdAt[row.Id] = row.CreatedAt;
            meta[row.Id] = new CrawlRunMeta { RenderMode = row.RenderMode, DiscoveryMode = row.DiscoveryMode };
        }

        return new PortfolioMaps
        {
            StartUrlByRunId = startUrl,
            RunCreatedAtByRunId = createdAt,
            RunMetaByRunId = meta,
            CrawlSummaries = crawlSummaries,
        };
    }
}
