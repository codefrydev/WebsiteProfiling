using AiService.Domain.Repositories;
using Npgsql;

namespace AiService.Application.Repositories;

public sealed class PipelineConfigReader(NpgsqlDataSource dataSource) : IPipelineConfigReader
{
    public async Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand("SELECT key, value FROM pipeline_config", conn);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);

        var dict = new Dictionary<string, string>(StringComparer.Ordinal);
        while (await reader.ReadAsync(cancellationToken))
        {
            var key = reader.GetString(0);
            var value = reader.IsDBNull(1) ? "" : reader.GetString(1);
            dict[key] = value;
        }

        return dict;
    }
}
