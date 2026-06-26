namespace IntegrationsService.Application.Repositories;

public sealed class PipelineConfigRepository(Npgsql.NpgsqlDataSource dataSource)
{
    private const int SingletonId = 1;

    public async Task<IReadOnlyDictionary<string, string>> ReadKnownAsync(
        CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);

        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT start_url FROM crawl_settings WHERE id = $1";
            cmd.Parameters.AddWithValue(SingletonId);
            var startUrl = await cmd.ExecuteScalarAsync(cancellationToken);
            if (startUrl is string s && !string.IsNullOrWhiteSpace(s))
            {
                result["start_url"] = s;
            }
        }

        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT bing_webmaster_api_key FROM integration_secrets WHERE id = $1";
            cmd.Parameters.AddWithValue(SingletonId);
            var key = await cmd.ExecuteScalarAsync(cancellationToken);
            if (key is string s && !string.IsNullOrWhiteSpace(s))
            {
                result["bing_webmaster_api_key"] = s;
            }
        }

        return result;
    }
}
