using CoreService.Api.Application.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.Application.Repositories;

public sealed class CrawlRepository(ReportDbContext db)
{
    public async Task<long?> GetLatestCrawlRunIdAsync(CancellationToken cancellationToken = default) =>
        await db.CrawlRuns
            .OrderByDescending(r => r.Id)
            .Select(r => (long?)r.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<long?> GetLatestCrawlRunIdForPropertyAsync(
        long propertyId,
        CancellationToken cancellationToken = default) =>
        await db.CrawlRuns
            .Where(r => r.PropertyId == propertyId)
            .OrderByDescending(r => r.Id)
            .Select(r => (long?)r.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<long?> GetLatestCrawlRunIdForStartUrlAsync(
        string startUrl,
        CancellationToken cancellationToken = default)
    {
        var target = CrawlRunResolver.NormalizeStartUrlKey(startUrl);
        if (target.Length == 0)
        {
            return null;
        }

        var candidates = await db.CrawlRuns
            .Where(r => r.StartUrl != null && r.StartUrl.Trim() != "")
            .OrderByDescending(r => r.Id)
            .Take(100)
            .Select(r => new { r.Id, r.StartUrl })
            .ToListAsync(cancellationToken);

        foreach (var row in candidates)
        {
            if (CrawlRunResolver.NormalizeStartUrlKey(row.StartUrl ?? "") == target)
            {
                return row.Id;
            }
        }

        return null;
    }

    public Task<long?> ResolveCrawlRunIdAsync(
        long? propertyId,
        string? startUrl,
        long? explicitRunId = null,
        CancellationToken cancellationToken = default) =>
        CrawlRunResolver.ResolveAsync(this, propertyId, startUrl, explicitRunId, cancellationToken);

    public async Task<IReadOnlyList<CrawlRow>> ReadCrawlAsync(
        long? crawlRunId = null,
        CancellationToken cancellationToken = default)
    {
        if (crawlRunId is null)
        {
            return [];
        }

        var entities = await db.CrawlResults
            .AsNoTracking()
            .Where(r => r.CrawlRunId == crawlRunId.Value)
            .ToListAsync(cancellationToken);

        return entities.Select(CrawlRowMapper.FromEntity).ToList();
    }

    public async Task<string?> GetCrawlRunCreatedAtIsoAsync(
        long? crawlRunId = null,
        CancellationToken cancellationToken = default)
    {
        var runId = crawlRunId ?? await GetLatestCrawlRunIdAsync(cancellationToken);
        if (runId is null)
        {
            return null;
        }

        var createdAt = await db.CrawlRuns
            .Where(r => r.Id == runId.Value)
            .Select(r => (DateTimeOffset?)r.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        return createdAt?.ToString("O");
    }
}
