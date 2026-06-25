namespace IntegrationsService.Application.Repositories;

public sealed class PipelineConfigRepository(Npgsql.NpgsqlDataSource dataSource)
{
    public async Task<IReadOnlyDictionary<string, string>> ReadKnownAsync(
        CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT key, value FROM pipeline_config
            WHERE is_unknown = false
            ORDER BY key
            """;

        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result[reader.GetString(0)] = reader.GetString(1);
        }

        return result;
    }
}
