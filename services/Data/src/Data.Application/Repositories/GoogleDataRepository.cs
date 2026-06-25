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
}
