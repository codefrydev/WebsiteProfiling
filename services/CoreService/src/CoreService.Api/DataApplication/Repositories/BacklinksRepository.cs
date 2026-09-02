using System.Text.Json;
using Npgsql;

namespace CoreService.Api.DataApplication.Repositories;

public interface IBacklinksRepository
{
    Task<IReadOnlyList<Dictionary<string, object?>>> ListVelocityAsync(
        long propertyId,
        CancellationToken cancellationToken);
}

public sealed class BacklinksRepository(NpgsqlDataSource dataSource) : IBacklinksRepository
{
    public async Task<IReadOnlyList<Dictionary<string, object?>>> ListVelocityAsync(
        long propertyId,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            SELECT fetched_at, referring_domains, top_domains
            FROM gsc_links_snapshots
            WHERE property_id = @propertyId
            ORDER BY fetched_at ASC
            LIMIT 52
            """,
            conn);
        cmd.Parameters.AddWithValue("propertyId", propertyId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        var snapshots = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            object? topDomains = Array.Empty<object>();
            if (!reader.IsDBNull(2))
            {
                var raw = reader.GetFieldValue<string>(2);
                try
                {
                    var parsed = JsonSerializer.Deserialize<JsonElement>(raw);
                    topDomains = parsed.ValueKind == JsonValueKind.Array
                        ? JsonSerializer.Deserialize<object>(raw)
                        : Array.Empty<object>();
                }
                catch (JsonException)
                {
                    topDomains = Array.Empty<object>();
                }
            }

            var fetched = reader.IsDBNull(0)
                ? null
                : reader.GetFieldValue<DateTimeOffset>(0).ToString("O");

            snapshots.Add(new Dictionary<string, object?>
            {
                ["capturedAt"] = fetched,
                ["referringDomains"] = reader.IsDBNull(1) ? 0 : reader.GetInt32(1),
                ["topDomains"] = topDomains,
            });
        }

        return snapshots;
    }
}
