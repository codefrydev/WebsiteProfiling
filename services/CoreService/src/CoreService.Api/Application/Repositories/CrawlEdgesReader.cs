using CoreService.Api.Application.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.Application.Repositories;

/// <summary>Reads plot/crawl internal link pairs from the <c>edges</c> table (Python <c>read_edges</c> parity).</summary>
public sealed class CrawlEdgesReader(ReportDbContext db)
{
    public async Task<IReadOnlyList<(string From, string To)>> ReadAsync(
        long? crawlRunId = null,
        CancellationToken cancellationToken = default)
    {
        var runId = crawlRunId ?? await db.CrawlRuns
            .OrderByDescending(r => r.Id)
            .Select(r => (long?)r.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (runId is null)
        {
            return [];
        }

        var rows = await db.CrawlGraphEdges
            .AsNoTracking()
            .Where(e => e.CrawlRunId == runId.Value)
            .Select(e => new { e.FromUrl, e.ToUrl })
            .ToListAsync(cancellationToken);

        return rows.Select(r => (r.FromUrl, r.ToUrl)).ToList();
    }
}
