using System.Text.Json;
using CoreService.Api.IntegrationsApplication.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.IntegrationsApplication.Repositories;

public sealed class GscLinksDataRepository(IntegrationsDbContext db)
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
        var json = await db.GscLinksData.AsNoTracking()
            .Where(x => x.PropertyId == propertyId)
            .OrderByDescending(x => x.Id)
            .Select(x => x.Data)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(json) ? null : JsonDocument.Parse(json);
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
