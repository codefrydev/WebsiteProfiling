using WebsiteProfiling.Contracts.Config;
using WebsiteProfiling.TypedConfig;
using Npgsql;

namespace ConfigService.Application.Repositories;

public sealed class ClientPreferencesRepository(NpgsqlDataSource dataSource) : IClientPreferencesRepository
{
    private const int SingletonId = 1;
    private static readonly TypedConfigManifest Manifest = TypedConfigManifest.Current;

    private static readonly string[] Columns =
    [
        "default_landing_view",
        "chat_fab_corner",
        "sidebar_collapsed",
        "network_view_mode",
        "content_studio_ai_enabled",
        "pipeline_python_exe",
        "pipeline_repo_root",
        "radius_scale",
        "density_scale",
        "animations_enabled",
        "font_size_scale",
    ];

    public async Task<ClientPreferencesDto> GetAsync(CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        var colList = string.Join(", ", Columns);
        await using var cmd = new NpgsqlCommand($"SELECT {colList} FROM client_preferences WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", SingletonId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new ClientPreferencesDto();
        }

        return new ClientPreferencesDto
        {
            DefaultLandingView = ReadText(reader, 0, "overview"),
            ChatFabCorner = ReadText(reader, 1, "bottom-right"),
            SidebarCollapsed = ReadBool(reader, 2, false),
            NetworkViewMode = ReadText(reader, 3, "2d"),
            ContentStudioAiEnabled = ReadBool(reader, 4, true),
            PipelinePythonExe = ReadText(reader, 5, "python3"),
            PipelineRepoRoot = ReadText(reader, 6, ""),
            RadiusScale = ReadText(reader, 7, "default"),
            DensityScale = ReadText(reader, 8, "default"),
            AnimationsEnabled = ReadBool(reader, 9, true),
            FontSizeScale = ReadText(reader, 10, "default"),
        };
    }

    public async Task PatchAsync(IReadOnlyDictionary<string, object> updates, CancellationToken cancellationToken = default)
    {
        if (updates.Count == 0 || !Manifest.TableColumns.TryGetValue("client_preferences", out var specs))
        {
            return;
        }

        var mapped = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (column, value) in updates)
        {
            if (!specs.ContainsKey(column))
            {
                continue;
            }

            mapped[column] = CoerceValue(column, value);
        }

        if (mapped.Count == 0)
        {
            return;
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        var sets = mapped.Keys.Select((col, i) => $"{col} = @p{i}").ToList();
        sets.Add("updated_at = now()");
        await using var cmd = new NpgsqlCommand(
            $"UPDATE client_preferences SET {string.Join(", ", sets)} WHERE id = @id",
            conn);
        var idx = 0;
        foreach (var value in mapped.Values)
        {
            cmd.Parameters.AddWithValue($"p{idx}", value ?? DBNull.Value);
            idx++;
        }

        cmd.Parameters.AddWithValue("id", SingletonId);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string ReadText(NpgsqlDataReader reader, int idx, string fallback) =>
        reader.IsDBNull(idx) ? fallback : reader.GetString(idx);

    private static bool ReadBool(NpgsqlDataReader reader, int idx, bool fallback) =>
        reader.IsDBNull(idx) ? fallback : reader.GetBoolean(idx);

    private static object CoerceValue(string column, object value)
    {
        if (column is "sidebar_collapsed" or "content_studio_ai_enabled" or "animations_enabled")
        {
            return value switch
            {
                bool b => b,
                _ => TypedConfigValueCoercion.ParseBool(value.ToString()),
            };
        }

        return value?.ToString() ?? "";
    }
}
