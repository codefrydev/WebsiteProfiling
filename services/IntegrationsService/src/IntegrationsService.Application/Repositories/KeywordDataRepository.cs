using System.Text.Json;
using IntegrationsService.Application.Google;

namespace IntegrationsService.Application.Repositories;

public sealed class KeywordDataRepository(Npgsql.NpgsqlDataSource dataSource)
{
    public async Task<JsonDocument?> ReadLatestAsync(
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT data FROM keyword_data
            WHERE property_id = @property_id
            ORDER BY id DESC LIMIT 1
            """;
        cmd.Parameters.AddWithValue("property_id", propertyId);
        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        if (result is not string json || string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        return JsonDocument.Parse(json);
    }

    public async Task<IReadOnlyList<KeywordHistoryPoint>> ReadHistoryAsync(
        long propertyId,
        string keyword,
        int limit = 30,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 90);
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT fetched_at, position, clicks, impressions, ctr
            FROM keyword_history
            WHERE property_id = @property_id AND keyword = @keyword
            ORDER BY id DESC LIMIT @limit
            """;
        cmd.Parameters.AddWithValue("property_id", propertyId);
        cmd.Parameters.AddWithValue("keyword", keyword);
        cmd.Parameters.AddWithValue("limit", limit);

        var rows = new List<KeywordHistoryPoint>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new KeywordHistoryPoint
            {
                FetchedAt = reader.GetFieldValue<DateTimeOffset>(0).ToString("O"),
                Position = reader.IsDBNull(1) ? null : reader.GetDouble(1),
                Clicks = reader.IsDBNull(2) ? null : reader.GetInt64(2),
                Impressions = reader.IsDBNull(3) ? null : reader.GetInt64(3),
                Ctr = reader.IsDBNull(4) ? null : reader.GetDouble(4),
            });
        }

        rows.Reverse();
        return rows;
    }

    public async Task<IReadOnlyDictionary<string, IReadOnlyList<KeywordHistoryPoint>>> ReadHistoryBatchAsync(
        long propertyId,
        IReadOnlyList<string> keywords,
        int limit = 30,
        CancellationToken cancellationToken = default)
    {
        var results = new Dictionary<string, IReadOnlyList<KeywordHistoryPoint>>(StringComparer.Ordinal);
        foreach (var keyword in keywords)
        {
            results[keyword] = await ReadHistoryAsync(propertyId, keyword, limit, cancellationToken);
        }

        return results;
    }
}

public sealed class KeywordHistoryPoint
{
    public string FetchedAt { get; init; } = "";

    public double? Position { get; init; }

    public long? Clicks { get; init; }

    public long? Impressions { get; init; }

    public double? Ctr { get; init; }
}
