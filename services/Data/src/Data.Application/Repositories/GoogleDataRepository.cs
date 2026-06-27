using System.Text.Json;
using System.Text.Json.Nodes;
using Data.Application.Mapping;
using Data.Application.Persistence;
using Data.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using WebsiteProfiling.Contracts.Google;
using WebsiteProfiling.Contracts.Json;

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

    public async Task<GoogleSlice?> GetLatestGoogleSliceAsync(
        long? propertyId,
        CancellationToken cancellationToken = default)
        => PayloadSliceMapper.ToGoogleSlice(await GetLatestPayloadAsync(propertyId, cancellationToken));

    public async Task<Dictionary<string, GscPageDetail>?> GetGscDetailByPageAsync(
        long? propertyId,
        CancellationToken cancellationToken = default)
    {
        var json = await GetGscDetailAsync(propertyId, cancellationToken);
        if (json?["by_page"] is not JsonObject byPage)
        {
            return null;
        }

        var result = new Dictionary<string, GscPageDetail>(StringComparer.Ordinal);
        foreach (var (key, node) in byPage)
        {
            if (node is null)
            {
                continue;
            }

            try
            {
                var detail = JsonSerializer.Deserialize<GscPageDetail>(node.ToJsonString(), ContractJsonOptions.Options);
                if (detail is not null)
                {
                    result[key] = detail with { Page = string.IsNullOrEmpty(detail.Page) ? key : detail.Page };
                }
            }
            catch (JsonException)
            {
                // skip malformed page
            }
        }

        return result.Count == 0 ? null : result;
    }

    private static void CopyIfPresent(JsonElement source, JsonObject target, string name)
    {
        if (source.TryGetProperty(name, out var val))
        {
            target[name] = JsonNode.Parse(val.GetRawText());
        }
    }
}
