using System.Text.Json;
using System.Text.Json.Nodes;
using Data.Application.Persistence;
using Data.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Data.Application.Repositories;

public sealed class GoogleDataRepository(DataDbContext db) : IGoogleDataRepository
{
    private static readonly HashSet<string> StripKeys = new(StringComparer.Ordinal)
    {
        "gsc_full",
        "ga4_full",
    };

    public async Task<JsonObject?> GetLatestPayloadAsync(
        long? propertyId,
        CancellationToken cancellationToken = default)
    {
        if (propertyId is null or <= 0)
        {
            return null;
        }

        var row = await db.Set<GoogleData>()
            .Where(g => g.PropertyId == propertyId)
            .OrderByDescending(g => g.Id)
            .Select(g => g.Data)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(row))
        {
            return null;
        }

        try
        {
            var node = JsonNode.Parse(row);
            if (node is not JsonObject obj)
            {
                return null;
            }

            foreach (var key in StripKeys)
            {
                obj.Remove(key);
            }

            return obj;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public async Task<JsonObject?> GetGscDetailAsync(
        long? propertyId,
        CancellationToken cancellationToken = default)
    {
        if (propertyId is null or <= 0)
        {
            return null;
        }

        var row = await db.Set<GoogleData>()
            .Where(g => g.PropertyId == propertyId)
            .OrderByDescending(g => g.Id)
            .Select(g => g.Data)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(row))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(row);
            var root = doc.RootElement;
            if (!root.TryGetProperty("gsc_full", out var gscFull)
                || !gscFull.TryGetProperty("by_page", out var byPage)
                || byPage.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var summaries = new JsonObject();
            foreach (var page in byPage.EnumerateObject())
            {
                if (page.Value.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var summary = new JsonObject();
                CopyIfPresent(page.Value, summary, "page");
                CopyIfPresent(page.Value, summary, "clicks");
                CopyIfPresent(page.Value, summary, "impressions");
                CopyIfPresent(page.Value, summary, "ctr");
                CopyIfPresent(page.Value, summary, "position");
                if (page.Value.TryGetProperty("queries", out var queries) && queries.ValueKind == JsonValueKind.Array)
                {
                    summary["query_count"] = queries.GetArrayLength();
                }

                summaries[page.Name] = summary;
            }

            var result = new JsonObject { ["by_page"] = summaries };
            if (root.TryGetProperty("fetched_at", out var fetchedAt))
            {
                result["fetched_at"] = JsonNode.Parse(fetchedAt.GetRawText());
            }

            if (root.TryGetProperty("date_range", out var dateRange))
            {
                result["date_range"] = JsonNode.Parse(dateRange.GetRawText());
            }

            return result;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static void CopyIfPresent(JsonElement source, JsonObject target, string name)
    {
        if (source.TryGetProperty(name, out var val))
        {
            target[name] = JsonNode.Parse(val.GetRawText());
        }
    }
}
