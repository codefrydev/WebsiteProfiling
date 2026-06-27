using System.Text.Json;
using Data.Application.Dto.Filters;
using Data.Application.Json;
using Data.Application.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Data.Application.Repositories;

public sealed class SavedFilterRepository(DataDbContext db) : ISavedFilterRepository
{
    public async Task<IReadOnlyList<SavedFilterRowDto>> ListAsync(
        int propertyId, CancellationToken cancellationToken)
    {
        var rows = await db.Set<Data.Domain.Entities.SavedCrawlFilter>()
            .AsNoTracking()
            .Where(x => x.PropertyId == propertyId)
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        return rows.Select(MapEntity).ToList();
    }

    public async Task UpsertAsync(
        long propertyId, string name, JsonElement filterJson, CancellationToken cancellationToken)
    {
        var existing = await db.Set<Data.Domain.Entities.SavedCrawlFilter>()
            .AsTracking()
            .FirstOrDefaultAsync(x => x.PropertyId == propertyId && x.Name == name, cancellationToken);

        var raw = filterJson.GetRawText();
        if (existing is null)
        {
            db.Set<Data.Domain.Entities.SavedCrawlFilter>().Add(new Data.Domain.Entities.SavedCrawlFilter
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
        var count = await db.Set<Data.Domain.Entities.SavedCrawlFilter>()
            .Where(x => x.PropertyId == propertyId && x.Name == name)
            .ExecuteDeleteAsync(cancellationToken);
        return count > 0;
    }

    private static SavedFilterRowDto MapEntity(Data.Domain.Entities.SavedCrawlFilter row)
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
