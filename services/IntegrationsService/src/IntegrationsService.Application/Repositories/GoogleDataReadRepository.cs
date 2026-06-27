using System.Text.Json;
using IntegrationsService.Application.Persistence;
using Microsoft.EntityFrameworkCore;

namespace IntegrationsService.Application.Repositories;

public sealed class GoogleDataReadRepository(IntegrationsDbContext db)
{
    public async Task<GoogleSnapshotRow?> ReadSnapshotRowAsync(
        long propertyId,
        long? snapshotId = null,
        CancellationToken cancellationToken = default)
    {
        var query = db.GoogleDataRows.AsNoTracking().Where(g => g.PropertyId == propertyId);
        query = snapshotId is not null
            ? query.Where(g => g.Id == snapshotId)
            : query.OrderByDescending(g => g.Id);

        var row = await query
            .Select(g => new { g.Id, g.FetchedAt, g.Data })
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        return new GoogleSnapshotRow(row.Id, FormatFetchedAt(row.FetchedAt), row.Data);
    }

    public async Task<GoogleSnapshotRow?> ReadSnapshotByIdAsync(
        long snapshotId,
        CancellationToken cancellationToken = default)
    {
        var row = await db.GoogleDataRows.AsNoTracking()
            .Where(g => g.Id == snapshotId)
            .Select(g => new { g.Id, g.FetchedAt, g.Data })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? null
            : new GoogleSnapshotRow(row.Id, FormatFetchedAt(row.FetchedAt), row.Data);
    }

    public async Task<IReadOnlyList<GoogleSnapshotRow>> ListSnapshotRowsAsync(
        long propertyId,
        int limit = 10,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 50);
        var rows = await db.GoogleDataRows.AsNoTracking()
            .Where(g => g.PropertyId == propertyId)
            .OrderByDescending(g => g.Id)
            .Take(limit)
            .Select(g => new { g.Id, g.FetchedAt, g.Data })
            .ToListAsync(cancellationToken);

        return rows
            .Select(r => new GoogleSnapshotRow(r.Id, FormatFetchedAt(r.FetchedAt), r.Data))
            .ToList();
    }

    public async Task<string?> ReadLastFetchedAtGlobalAsync(CancellationToken cancellationToken = default)
    {
        var fetchedAt = await db.GoogleDataRows.AsNoTracking()
            .OrderByDescending(g => g.Id)
            .Select(g => (DateTimeOffset?)g.FetchedAt)
            .FirstOrDefaultAsync(cancellationToken);

        return fetchedAt is null ? null : FormatFetchedAt(fetchedAt.Value);
    }

    private static string FormatFetchedAt(DateTimeOffset fetchedAt) =>
        fetchedAt.ToString("O");
}

public sealed record GoogleSnapshotRow(long Id, string FetchedAt, string DataJson)
{
    public JsonDocument ParseData() => JsonDocument.Parse(DataJson);
}
