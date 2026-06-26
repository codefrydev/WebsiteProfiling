using Microsoft.EntityFrameworkCore;
using ReportService.Application.Persistence;

namespace ReportService.Application.Repositories;

public sealed class CrawlRepository(ReportDbContext db)
{
    public async Task<long?> GetLatestCrawlRunIdAsync(CancellationToken cancellationToken = default) =>
        await db.CrawlRuns
            .OrderByDescending(r => r.Id)
            .Select(r => (long?)r.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<CrawlRow>> ReadCrawlAsync(
        long? crawlRunId = null,
        CancellationToken cancellationToken = default)
    {
        var runId = crawlRunId ?? await GetLatestCrawlRunIdAsync(cancellationToken);

        var query = db.CrawlResults.AsQueryable();
        if (runId is not null)
        {
            query = query.Where(r => r.CrawlRunId == runId.Value);
        }

        var entities = await query
            .AsNoTracking()
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
