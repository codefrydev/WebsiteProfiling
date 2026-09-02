using CoreService.Api.Application.Build;
using CoreService.Api.Application.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.Application.Repositories;

public sealed class LinkEdgesReader(ReportDbContext db)
{
    public async Task<IReadOnlyList<LinkEdgeRow>> ReadAsync(
        long? crawlRunId = null,
        int limit = 15000,
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

        var cap = Math.Max(1, limit);
        var rows = await db.LinkEdges
            .AsNoTracking()
            .Where(e => e.CrawlRunId == runId.Value)
            .Take(cap)
            .Select(e => new LinkEdgeRow(
                e.FromUrl,
                e.ToUrl,
                e.AnchorText,
                e.Rel,
                e.IsNofollow,
                e.IsSponsored,
                e.IsUgc,
                e.LinkType,
                e.Position))
            .ToListAsync(cancellationToken);

        return rows;
    }
}
