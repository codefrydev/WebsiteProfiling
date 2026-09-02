using Npgsql;
using WebsiteProfiling.Contracts.Config;

namespace WebsiteProfiling.TypedConfig;

/// <summary>
/// Single implementation for reading/writing flat pipeline state keys to typed Postgres tables.
/// </summary>
public static class TypedConfigPipelineStore
{
    private const int SingletonId = 1;

    public static async Task<Dictionary<string, string>> ReadFlatStateAsync(
        NpgsqlConnection conn,
        TypedConfigManifest manifest,
        CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var (table, columns) in manifest.DomainTables)
        {
            if (columns.Count == 0)
            {
                continue;
            }

            var colList = string.Join(", ", columns);
            await using var cmd = new NpgsqlCommand($"SELECT {colList} FROM {table} WHERE id = @id", conn);
            cmd.Parameters.AddWithValue("id", SingletonId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                continue;
            }

            for (var idx = 0; idx < columns.Count; idx++)
            {
                result[columns[idx]] = reader.IsDBNull(idx) ? "" : reader.GetValue(idx)?.ToString() ?? "";
            }
        }

        foreach (var tableName in TypedConfigManifest.PipelineSingletonTables)
        {
            if (!manifest.TableColumns.TryGetValue(tableName, out var specs) || specs.Count == 0)
            {
                continue;
            }

            var columns = specs.Keys.ToList();
            var colList = string.Join(", ", columns);
            await using var cmd = new NpgsqlCommand($"SELECT {colList} FROM {tableName} WHERE id = @id", conn);
            cmd.Parameters.AddWithValue("id", SingletonId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                continue;
            }

            for (var idx = 0; idx < columns.Count; idx++)
            {
                var column = columns[idx];
                var spec = specs[column];
                if (spec.StateKey is not { Length: > 0 })
                {
                    continue;
                }

                result[spec.StateKey] = FormatStateValue(reader, idx, spec);
            }
        }

        return result;
    }

    public static async Task SaveFlatStateAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        IReadOnlyDictionary<string, string> entries,
        TypedConfigManifest manifest,
        CancellationToken cancellationToken = default)
    {
        if (entries.Count == 0)
        {
            return;
        }

        var domainUpdates = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
        var singletonUpdates = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);

        foreach (var (stateKey, value) in entries)
        {
            if (!manifest.StateKeyToRoute.TryGetValue(stateKey, out var route))
            {
                continue;
            }

            var target = route.Kind == "domain" ? domainUpdates : singletonUpdates;
            if (!target.TryGetValue(route.Table, out var cols))
            {
                cols = new Dictionary<string, string>(StringComparer.Ordinal);
                target[route.Table] = cols;
            }

            cols[route.Column] = value;
        }

        foreach (var (table, updates) in domainUpdates)
        {
            await PatchTextTableAsync(conn, tx, table, updates, cancellationToken);
        }

        foreach (var (table, updates) in singletonUpdates)
        {
            if (table == "workspace_settings")
            {
                await PatchWorkspaceSettingsAsync(conn, tx, updates, cancellationToken);
            }
            else
            {
                manifest.TableColumns.TryGetValue(table, out var specs);
                await PatchTypedTableAsync(conn, tx, table, updates, specs, cancellationToken);
            }
        }
    }

    public static string FormatStateValue(NpgsqlDataReader reader, int idx, TypedConfigManifest.ColumnSpec spec)
    {
        if (reader.IsDBNull(idx))
        {
            return spec.Default switch
            {
                bool b => b ? "true" : "false",
                int n => n.ToString(),
                string s => s,
                _ => "",
            };
        }

        return spec.Type switch
        {
            "bool" => reader.GetBoolean(idx) ? "true" : "false",
            "int" => reader.GetInt32(idx).ToString(),
            "bigint" => reader.GetInt64(idx).ToString(),
            _ => reader.GetValue(idx)?.ToString() ?? "",
        };
    }

    private static async Task PatchTextTableAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        string table,
        IReadOnlyDictionary<string, string> updates,
        CancellationToken cancellationToken)
    {
        if (updates.Count == 0)
        {
            return;
        }

        var mapped = updates.ToDictionary(
            static pair => pair.Key,
            static pair => (object?)(pair.Value ?? ""),
            StringComparer.Ordinal);
        await ExecutePatchAsync(conn, tx, table, mapped, cancellationToken);
    }

    private static async Task PatchTypedTableAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        string table,
        IReadOnlyDictionary<string, string> updates,
        IReadOnlyDictionary<string, TypedConfigManifest.ColumnSpec>? columnSpecs,
        CancellationToken cancellationToken)
    {
        if (updates.Count == 0)
        {
            return;
        }

        var mapped = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (column, value) in updates)
        {
            if (columnSpecs?.TryGetValue(column, out var spec) == true)
            {
                mapped[column] = TypedConfigValueCoercion.Coerce(value, spec.Type, spec.Default);
            }
            else
            {
                mapped[column] = value ?? "";
            }
        }

        await ExecutePatchAsync(conn, tx, table, mapped, cancellationToken);
    }

    private static async Task PatchWorkspaceSettingsAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        IReadOnlyDictionary<string, string> updates,
        CancellationToken cancellationToken)
    {
        var mapped = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (column, value) in updates)
        {
            mapped[column] = column == "active_property_id"
                ? long.TryParse(value, out var id) ? id : null
                : value;
        }

        if (mapped.Count == 0)
        {
            return;
        }

        await ExecutePatchAsync(conn, tx, "workspace_settings", mapped, cancellationToken);
    }

    private static async Task ExecutePatchAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        string table,
        IReadOnlyDictionary<string, object?> mapped,
        CancellationToken cancellationToken)
    {
        var sets = mapped.Keys.Select((col, i) => $"{col} = @p{i}").ToList();
        sets.Add("updated_at = now()");
        await using var cmd = new NpgsqlCommand(
            $"UPDATE {table} SET {string.Join(", ", sets)} WHERE id = @id",
            conn,
            tx);
        var idx = 0;
        foreach (var value in mapped.Values)
        {
            cmd.Parameters.AddWithValue($"p{idx}", value ?? DBNull.Value);
            idx++;
        }

        cmd.Parameters.AddWithValue("id", SingletonId);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }
}
