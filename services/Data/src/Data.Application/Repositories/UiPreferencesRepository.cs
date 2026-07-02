using System.Text.Json;
using WebsiteProfiling.TypedConfig;
using Npgsql;
using NpgsqlTypes;

namespace Data.Application.Repositories;

public sealed class UiPreferencesRepository(NpgsqlDataSource dataSource) : IUiPreferencesRepository
{
    private const int SingletonId = 1;
    private static readonly TypedConfigManifest Manifest = TypedConfigManifest.Current;

    public async Task<UiPreferencesDto> GetAsync(CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "SELECT brand_name, brand_subtitle, brand_logo_url, custom_theme_json, ui_prefs_json FROM ui_preferences WHERE id = @id",
            conn);
        cmd.Parameters.AddWithValue("id", SingletonId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new UiPreferencesDto();
        }

        return new UiPreferencesDto
        {
            BrandName = reader.IsDBNull(0) ? "" : reader.GetString(0),
            BrandSubtitle = reader.IsDBNull(1) ? "" : reader.GetString(1),
            BrandLogoUrl = reader.IsDBNull(2) ? "" : reader.GetString(2),
            CustomThemeJson = ReadJsonElement(reader, 3),
            UiPrefsJson = ReadJsonElement(reader, 4),
        };
    }

    public async Task PatchAsync(IReadOnlyDictionary<string, string> updates, CancellationToken cancellationToken = default)
    {
        if (updates.Count == 0)
        {
            return;
        }

        if (!Manifest.TableColumns.TryGetValue("ui_preferences", out var specs))
        {
            return;
        }

        var appKeyToColumn = specs
            .Where(pair => pair.Value.AppKey is { Length: > 0 })
            .ToDictionary(pair => pair.Value.AppKey!, pair => pair.Key, StringComparer.Ordinal);

        var mapped = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (appKey, value) in updates)
        {
            var column = appKeyToColumn.GetValueOrDefault(appKey, appKey);
            if (!specs.ContainsKey(column))
            {
                continue;
            }

            mapped[column] = column.EndsWith("_json", StringComparison.Ordinal)
                ? ParseJsonValue(value)
                : value;
        }

        if (mapped.Count == 0)
        {
            return;
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        var sets = mapped.Keys.Select((col, i) => $"{col} = @p{i}").ToList();
        sets.Add("updated_at = now()");
        await using var cmd = new NpgsqlCommand(
            $"UPDATE ui_preferences SET {string.Join(", ", sets)} WHERE id = @id",
            conn);
        var idx = 0;
        foreach (var (column, value) in mapped)
        {
            if (column.EndsWith("_json", StringComparison.Ordinal))
            {
                cmd.Parameters.Add(new NpgsqlParameter($"p{idx}", NpgsqlDbType.Jsonb)
                {
                    Value = value ?? DBNull.Value,
                });
            }
            else
            {
                cmd.Parameters.AddWithValue($"p{idx}", value ?? "");
            }

            idx++;
        }

        cmd.Parameters.AddWithValue("id", SingletonId);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static JsonElement? ReadJsonElement(NpgsqlDataReader reader, int idx)
    {
        if (reader.IsDBNull(idx))
        {
            return null;
        }

        var value = reader.GetValue(idx);
        if (value is JsonDocument doc)
        {
            return doc.RootElement.Clone();
        }

        if (value is string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            using var parsed = JsonDocument.Parse(raw);
            return parsed.RootElement.Clone();
        }

        return null;
    }

    private static object? ParseJsonValue(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }
}
