using System.Text.Json;
using Data.Application.Dto.Filters;
using Data.Application.Json;
using Data.Application.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace Data.Application.Repositories;

public sealed class SavedFilterRepository(DataDbContext db, NpgsqlDataSource dataSource) : ISavedFilterRepository
{
    private const string UpsertSql = """
        INSERT INTO saved_crawl_filters (property_id, name, filter_json)
        VALUES (@property_id, @name, @filter_json)
        ON CONFLICT (property_id, name) DO UPDATE SET filter_json = EXCLUDED.filter_json
        """;

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
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(UpsertSql, conn);
        cmd.Parameters.AddWithValue("property_id", propertyId);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.Add(new NpgsqlParameter("filter_json", NpgsqlDbType.Jsonb)
        {
            Value = filterJson.GetRawText(),
        });
        await cmd.ExecuteNonQueryAsync(cancellationToken);
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
