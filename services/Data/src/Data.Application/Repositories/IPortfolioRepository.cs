using Data.Application.Dto.Portfolio;

namespace Data.Application.Repositories;

public interface IPortfolioRepository
{
    Task<(int ReportCount, long ReportMaxId, int CrawlCount, long CrawlMaxId)> GetCacheKeyPartsAsync(
        CancellationToken cancellationToken);

    Task<IReadOnlyList<PortfolioReportRow>> ListReportsAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<PortfolioReportRow>> ListReportsLatestPerDomainAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<PortfolioCrawlRunRow>> ListCrawlRunsAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<PortfolioCrawlSummaryRow>> ListCrawlRunSummariesAsync(
        int? maxRuns, CancellationToken cancellationToken);

    Task<IReadOnlyDictionary<long, string>> ReadReportPayloadsPortfolioAsync(
        IReadOnlyList<long> reportIds, CancellationToken cancellationToken);

    Task<string?> ReadReportPayloadAsync(long reportId, CancellationToken cancellationToken);

    Task<long?> FindReportIdByCrawlRunIdAsync(long crawlRunId, CancellationToken cancellationToken);

    /// <summary>
    /// Port of <c>portfolio_store.delete_portfolio_item</c>: deletes report and/or crawl run rows.
    /// Returns true if at least one delete succeeded (when both ids are given, the last op wins, matching Python).
    /// </summary>
    Task<bool> DeletePortfolioItemAsync(long? reportId, long? crawlRunId, CancellationToken cancellationToken);
}
