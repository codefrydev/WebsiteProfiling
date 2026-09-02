using CoreService.Api.Domain.Integrations.Entities;
using CoreService.Api.IntegrationsApplication.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.IntegrationsApplication.Repositories;

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
