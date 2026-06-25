using IntegrationsService.Application.Persistence;
using IntegrationsService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace IntegrationsService.Application.Repositories;

public sealed class GoogleDataWriteRepository(IntegrationsDbContext db)
{
    public async Task<long> InsertAsync(
        long propertyId,
        string dataJson,
        DateTimeOffset? fetchedAt = null,
        CancellationToken cancellationToken = default)
    {
        var row = new GoogleData
        {
            PropertyId = propertyId,
            FetchedAt = fetchedAt ?? DateTimeOffset.UtcNow,
            Data = dataJson,
        };
        db.GoogleDataRows.Add(row);
        await db.SaveChangesAsync(cancellationToken);
        return row.Id;
    }

    public async Task<DateTimeOffset?> GetLastFetchedAtAsync(
        long propertyId,
        CancellationToken cancellationToken = default) =>
        await db.GoogleDataRows
            .Where(g => g.PropertyId == propertyId)
            .OrderByDescending(g => g.Id)
            .Select(g => (DateTimeOffset?)g.FetchedAt)
            .FirstOrDefaultAsync(cancellationToken);
}
