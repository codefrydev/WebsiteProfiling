using System.Text.Json;
using Npgsql;

namespace IntegrationsService.Application.Repositories;

public sealed class GscLinksDataRepository(NpgsqlDataSource dataSource)
{
    public async Task<IReadOnlyDictionary<string, object?>> ReadStatusAsync(
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        var data = await ReadLatestAsync(propertyId, cancellationToken);
        if (data is null)
        {
            return new Dictionary<string, object?> { ["hasData"] = false };
        }

        return new Dictionary<string, object?>
        {
            ["hasData"] = true,
            ["lastImportedAt"] = GetString(data, "imported_at"),
            ["exportTypes"] = GetStringArray(data, "export_types"),
            ["rowCounts"] = GetObject(data, "row_counts") ?? new Dictionary<string, object?>(),
            ["referringDomainCount"] = GetArrayCount(data, "top_linking_sites"),
            ["topLinkedPageCount"] = GetArrayCount(data, "top_linked_pages"),
            ["sampleLinkCount"] = GetArrayCount(data, "sample_links"),
            ["latestLinkCount"] = GetArrayCount(data, "latest_links"),
        };
    }

    public async Task<JsonDocument?> ReadLatestAsync(
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT data FROM gsc_links_data
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

    private static string? GetString(JsonDocument doc, string key)
    {
        if (!doc.RootElement.TryGetProperty(key, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Null => null,
            _ => value.GetRawText(),
        };
    }

    private static object? GetObject(JsonDocument doc, string key)
    {
        if (!doc.RootElement.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return JsonSerializer.Deserialize<Dictionary<string, object?>>(value.GetRawText());
    }

    private static IReadOnlyList<string> GetStringArray(JsonDocument doc, string key)
    {
        if (!doc.RootElement.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return value.EnumerateArray()
            .Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() ?? "" : e.GetRawText())
            .ToList();
    }

    private static int GetArrayCount(JsonDocument doc, string key)
    {
        if (!doc.RootElement.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.Array)
        {
            return 0;
        }

        return value.GetArrayLength();
    }
}
