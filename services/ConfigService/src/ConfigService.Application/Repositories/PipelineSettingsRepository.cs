using Npgsql;
using WebsiteProfiling.TypedConfig;

namespace ConfigService.Application.Repositories;

public sealed class PipelineSettingsRepository(NpgsqlDataSource dataSource) : IPipelineSettingsRepository
{
    private const int SingletonId = 1;
    private static readonly TypedConfigManifest Manifest = TypedConfigManifest.Current;

    public async Task<PipelineSettingsResponse> GetAsync(CancellationToken cancellationToken = default)
    {
        var domains = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
        var state = new Dictionary<string, string>(StringComparer.Ordinal);

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);

        foreach (var (table, columns) in Manifest.DomainTables)
        {
            if (!Manifest.DomainResponseKeys.TryGetValue(table, out var responseKey))
            {
                continue;
            }

            var payload = await ReadTextColumnsAsync(conn, table, columns, cancellationToken);
            domains[responseKey] = payload;
            foreach (var (column, value) in payload)
            {
                state[column] = value;
            }
        }

        foreach (var tableName in TypedConfigManifest.PipelineSingletonTables)
        {
            if (!Manifest.TableColumns.TryGetValue(tableName, out var specs))
            {
                continue;
            }

            var values = await ReadMixedColumnsAsync(conn, tableName, specs, cancellationToken);
            foreach (var (column, value) in values)
            {
                if (specs.TryGetValue(column, out var spec) && spec.StateKey is { Length: > 0 })
                {
                    state[spec.StateKey] = value;
                }
            }
        }

        var workspace = await ReadWorkspaceAsync(conn, cancellationToken);

        return new PipelineSettingsResponse
        {
            Domains = domains,
            Workspace = workspace,
            State = state,
        };
    }

    public async Task SaveStateAsync(IReadOnlyDictionary<string, string> entries, CancellationToken cancellationToken = default)
    {
        if (entries.Count == 0)
        {
            return;
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var tx = await conn.BeginTransactionAsync(cancellationToken);
        await TypedConfigPipelineStore.SaveFlatStateAsync(conn, tx, entries, Manifest, cancellationToken);
        await tx.CommitAsync(cancellationToken);
    }

    private static async Task<Dictionary<string, string>> ReadTextColumnsAsync(
        NpgsqlConnection conn,
        string table,
        IReadOnlyList<string> columns,
        CancellationToken cancellationToken)
    {
        var payload = new Dictionary<string, string>(StringComparer.Ordinal);
        if (columns.Count == 0)
        {
            return payload;
        }

        var colList = string.Join(", ", columns);
        await using var cmd = new NpgsqlCommand($"SELECT {colList} FROM {table} WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", SingletonId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            foreach (var column in columns)
            {
                payload[column] = "";
            }

            return payload;
        }

        for (var idx = 0; idx < columns.Count; idx++)
        {
            payload[columns[idx]] = reader.IsDBNull(idx) ? "" : reader.GetValue(idx)?.ToString() ?? "";
        }

        return payload;
    }

    private static async Task<Dictionary<string, string>> ReadMixedColumnsAsync(
        NpgsqlConnection conn,
        string table,
        IReadOnlyDictionary<string, TypedConfigManifest.ColumnSpec> specs,
        CancellationToken cancellationToken)
    {
        var columns = specs.Keys.ToList();
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        if (columns.Count == 0)
        {
            return values;
        }

        var colList = string.Join(", ", columns);
        await using var cmd = new NpgsqlCommand($"SELECT {colList} FROM {table} WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", SingletonId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return values;
        }

        for (var idx = 0; idx < columns.Count; idx++)
        {
            var column = columns[idx];
            var spec = specs[column];
            values[column] = TypedConfigPipelineStore.FormatStateValue(reader, idx, spec);
        }

        return values;
    }

    private static async Task<WorkspaceSettingsPayload> ReadWorkspaceAsync(
        NpgsqlConnection conn,
        CancellationToken cancellationToken)
    {
        await using var cmd = new NpgsqlCommand(
            "SELECT active_property_id, warning_mapper_input, warning_mapper_input_type FROM workspace_settings WHERE id = @id",
            conn);
        cmd.Parameters.AddWithValue("id", SingletonId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new WorkspaceSettingsPayload();
        }

        long? activePropertyId = reader.IsDBNull(0) ? null : reader.GetInt64(0);
        var warningMapperInput = reader.IsDBNull(1) ? "" : reader.GetString(1);
        var warningMapperInputType = reader.IsDBNull(2) ? "lighthouse" : reader.GetString(2);

        return new WorkspaceSettingsPayload
        {
            ActivePropertyId = activePropertyId,
            WarningMapperInput = warningMapperInput,
            WarningMapperInputType = warningMapperInputType,
        };
    }
}
