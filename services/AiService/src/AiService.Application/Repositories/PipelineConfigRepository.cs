using AiService.Domain.Repositories;
using Npgsql;

namespace AiService.Application.Repositories;

public sealed class PipelineConfigRepository(NpgsqlDataSource dataSource) : IPipelineConfigRepository
{
    public async Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken = default)
    {
        var (known, unknown) = await LoadFullAsync(cancellationToken);
        var combined = new Dictionary<string, string>(known, StringComparer.Ordinal);
        foreach (var entry in unknown)
        {
            combined[entry.Key] = entry.Value;
        }

        return combined;
    }

    public async Task<(IReadOnlyDictionary<string, string> Known, IReadOnlyList<PipelineConfigUnknownEntry> Unknown)> LoadFullAsync(
        CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "SELECT key, value, is_unknown FROM pipeline_config ORDER BY key",
            conn);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);

        var known = new Dictionary<string, string>(StringComparer.Ordinal);
        var unknown = new List<PipelineConfigUnknownEntry>();

        while (await reader.ReadAsync(cancellationToken))
        {
            var key = reader.GetString(0);
            var value = reader.IsDBNull(1) ? "" : reader.GetString(1);
            var isUnknown = !reader.IsDBNull(2) && reader.GetBoolean(2);
            if (isUnknown)
            {
                unknown.Add(new PipelineConfigUnknownEntry(key, value));
            }
            else
            {
                known[key] = value;
            }
        }

        return (known, unknown);
    }

    public async Task SaveAsync(
        IReadOnlyDictionary<string, string> known,
        IReadOnlyList<PipelineConfigUnknownEntry> unknown,
        CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var tx = await conn.BeginTransactionAsync(cancellationToken);

        await using (var delete = new NpgsqlCommand("DELETE FROM pipeline_config", conn, tx))
        {
            await delete.ExecuteNonQueryAsync(cancellationToken);
        }

        var now = DateTimeOffset.UtcNow;

        foreach (var (key, value) in known)
        {
            await using var insert = new NpgsqlCommand(
                "INSERT INTO pipeline_config (key, value, is_unknown, updated_at) VALUES ($1, $2, false, $3)",
                conn,
                tx);
            insert.Parameters.AddWithValue(key);
            insert.Parameters.AddWithValue(value ?? "");
            insert.Parameters.AddWithValue(now);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        foreach (var entry in unknown)
        {
            await using var insert = new NpgsqlCommand(
                """
                INSERT INTO pipeline_config (key, value, is_unknown, updated_at)
                VALUES ($1, $2, true, $3)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_unknown = true, updated_at = EXCLUDED.updated_at
                """,
                conn,
                tx);
            insert.Parameters.AddWithValue(entry.Key);
            insert.Parameters.AddWithValue(entry.Value ?? "");
            insert.Parameters.AddWithValue(now);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        await tx.CommitAsync(cancellationToken);
    }
}
