using System.Text.Json;
using Data.Application.Dto.Portfolio;
using Data.Application.Repositories;
using Microsoft.Extensions.Caching.Memory;

namespace Data.Application.Portfolio;

public interface IPortfolioService
{
    Task<object> GetPortfolioResponseAsync(
        string widget,
        IReadOnlyList<long> ids,
        long? reportId,
        long? crawlRunId,
        CancellationToken cancellationToken);
}

public sealed class PortfolioService(
    IPortfolioRepository repository,
    IMemoryCache cache) : IPortfolioService
{
    public async Task<object> GetPortfolioResponseAsync(
        string widget,
        IReadOnlyList<long> ids,
        long? reportId,
        long? crawlRunId,
        CancellationToken cancellationToken)
    {
        if (widget.Equals("groups", StringComparison.OrdinalIgnoreCase))
        {
            var keyParts = await repository.GetCacheKeyPartsAsync(cancellationToken);
            var cacheKey = $"portfolio:groups:{keyParts.ReportCount}:{keyParts.ReportMaxId}:{keyParts.CrawlCount}:{keyParts.CrawlMaxId}";
            if (cache.TryGetValue(cacheKey, out PortfolioGroupsResponseDto? cached) && cached is not null)
                return cached;
        }

        var allReports = await repository.ListReportsAsync(cancellationToken);
        var idSet = ids.ToHashSet();
        IReadOnlyList<PortfolioReportRow> reportList;

        if ((widget.Equals("groups", StringComparison.OrdinalIgnoreCase) ||
             widget.Equals("summary", StringComparison.OrdinalIgnoreCase)) && ids.Count == 0)
        {
            reportList = await repository.ListReportsLatestPerDomainAsync(cancellationToken);
        }
        else if (ids.Count > 0)
        {
            reportList = allReports.Where(r => idSet.Contains(r.Id)).ToList();
        }
        else
        {
            reportList = allReports;
        }

        if (widget.Equals("card", StringComparison.OrdinalIgnoreCase))
        {
            var crawlRows = await repository.ListCrawlRunsAsync(cancellationToken);
            var summaries = await repository.ListCrawlRunSummariesAsync(null, cancellationToken);
            var maps = PortfolioMaps.Load(crawlRows, summaries);
            var group = await BuildPortfolioCardAsync(
                reportList, maps, reportId, crawlRunId, cancellationToken);
            return new PortfolioCardResponseDto { Group = group };
        }

        var bundle = await BuildGroupsBundleAsync(reportList, cancellationToken);

        if (widget.Equals("summary", StringComparison.OrdinalIgnoreCase))
            return PortfolioGrouping.ComputeSummary(bundle.Groups);

        var payload = new PortfolioGroupsResponseDto
        {
            Groups = bundle.Groups,
            CrawlHistoryByDomain = bundle.CrawlHistoryByDomain,
        };

        if (widget.Equals("groups", StringComparison.OrdinalIgnoreCase))
        {
            var keyParts = await repository.GetCacheKeyPartsAsync(cancellationToken);
            var cacheKey = $"portfolio:groups:{keyParts.ReportCount}:{keyParts.ReportMaxId}:{keyParts.CrawlCount}:{keyParts.CrawlMaxId}";
            cache.Set(cacheKey, payload, PortfolioConstants.GroupsCacheTtl);
        }

        return payload;
    }

    private async Task<PortfolioGroupsResponseDto> BuildGroupsBundleAsync(
        IReadOnlyList<PortfolioReportRow> reportList,
        CancellationToken cancellationToken)
    {
        var crawlRows = await repository.ListCrawlRunsAsync(cancellationToken);
        var summaries = await repository.ListCrawlRunSummariesAsync(
            PortfolioConstants.MaxCrawlRuns, cancellationToken);
        var maps = PortfolioMaps.Load(crawlRows, summaries);

        var reportIds = reportList.Select(r => r.Id).ToList();
        var payloadJson = await repository.ReadReportPayloadsPortfolioAsync(reportIds, cancellationToken);

        JsonElement? GetPayload(long rid)
        {
            if (!payloadJson.TryGetValue(rid, out var json)) return null;
            try
            {
                using var doc = JsonDocument.Parse(json);
                return doc.RootElement.Clone();
            }
            catch
            {
                return null;
            }
        }

        var reportGroups = PortfolioGrouping.ComputeDomainGroups(reportList, maps, GetPayload);
        var crawlOnly = PortfolioGrouping.ComputeCrawlOnlyGroups(maps.CrawlSummaries, reportGroups);
        var groups = PortfolioGrouping.MergeGroups(reportGroups, crawlOnly);
        var crawlHistory = PortfolioHistory.BuildCrawlHistoryByDomain(maps.CrawlSummaries);

        return new PortfolioGroupsResponseDto
        {
            Groups = groups,
            CrawlHistoryByDomain = crawlHistory,
        };
    }

    private async Task<PortfolioGroupDto?> BuildPortfolioCardAsync(
        IReadOnlyList<PortfolioReportRow> reportList,
        PortfolioMaps maps,
        long? reportId,
        long? crawlRunId,
        CancellationToken cancellationToken)
    {
        static JsonElement? ParsePayload(string? json)
        {
            if (json is null) return null;
            try
            {
                using var doc = JsonDocument.Parse(json);
                return doc.RootElement.Clone();
            }
            catch
            {
                return null;
            }
        }

        if (reportId is not null)
        {
            var row = reportList.FirstOrDefault(r => r.Id == reportId.Value);
            if (row is null) return null;
            var json = await repository.ReadReportPayloadAsync(reportId.Value, cancellationToken);
            var payload = ParsePayload(json);
            var groups = PortfolioGrouping.ComputeDomainGroups([row], maps, _ => payload);
            return groups.FirstOrDefault();
        }

        if (crawlRunId is not null)
        {
            var matchedId = await repository.FindReportIdByCrawlRunIdAsync(crawlRunId.Value, cancellationToken);
            if (matchedId is not null)
            {
                var row = reportList.FirstOrDefault(r => r.Id == matchedId.Value)
                    ?? new PortfolioReportRow { Id = matchedId.Value };
                var json = await repository.ReadReportPayloadAsync(matchedId.Value, cancellationToken);
                var payload = ParsePayload(json);
                var groups = PortfolioGrouping.ComputeDomainGroups([row], maps, _ => payload);
                var fromReport = groups.FirstOrDefault();
                if (fromReport is not null) return fromReport;
            }

            var summary = maps.CrawlSummaries.FirstOrDefault(s => s.CrawlRunId == crawlRunId.Value);
            if (summary is null) return null;
            var crawlOnly = PortfolioGrouping.ComputeCrawlOnlyGroups([summary], []);
            return crawlOnly.FirstOrDefault();
        }

        return null;
    }
}
