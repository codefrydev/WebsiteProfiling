using System.Text.Json;
using CoreService.Api.DataApplication.Dto.Filters;
using CoreService.Api.DataApplication.Json;
using CoreService.Api.DataApplication.Persistence;
using CoreService.Api.Domain.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.DataApplication.Repositories;

public sealed class SavedFilterRepository(DataDbContext db) : ISavedFilterRepository
{
    public async Task<IReadOnlyList<SavedFilterRowDto>> ListAsync(
        int propertyId, CancellationToken cancellationToken)
    {
        var rows = await db.Set<SavedCrawlFilter>()
            .AsNoTracking()
            .Where(x => x.PropertyId == propertyId)
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        return rows.Select(MapEntity).ToList();
    }

    public async Task UpsertAsync(
        long propertyId, string name, JsonElement filterJson, CancellationToken cancellationToken)
    {
        var existing = await db.Set<SavedCrawlFilter>()
            .AsTracking()
            .FirstOrDefaultAsync(x => x.PropertyId == propertyId && x.Name == name, cancellationToken);

        var raw = filterJson.GetRawText();
        if (existing is null)
        {
            db.Set<SavedCrawlFilter>().Add(new SavedCrawlFilter
            {
                PropertyId = propertyId,
                Name = name,
                FilterJson = raw,
                CreatedAt = DateTimeOffset.UtcNow,
            });
        }
        else
        {
            existing.FilterJson = raw;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> DeleteAsync(long propertyId, string name, CancellationToken cancellationToken)
    {
        var count = await db.Set<SavedCrawlFilter>()
            .Where(x => x.PropertyId == propertyId && x.Name == name)
            .ExecuteDeleteAsync(cancellationToken);
        return count > 0;
    }

    private static SavedFilterRowDto MapEntity(SavedCrawlFilter row)
    {
        JsonElement filterJson;
        try
        {
            filterJson = JsonDocument.Parse(row.FilterJson).RootElement.Clone();
        }
        catch (JsonException)
        {
            filterJson = JsonSerializer.SerializeToElement(new { });
        }

        return new SavedFilterRowDto
        {
            Id = row.Id,
            PropertyId = row.PropertyId,
            Name = row.Name,
            FilterJson = filterJson,
            CreatedAt = PyIso.Format(row.CreatedAt),
        };
    }
}
