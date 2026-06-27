using System.Text.Json;
using IntegrationsService.Application.Google;
using IntegrationsService.Application.Persistence;
using Microsoft.EntityFrameworkCore;

namespace IntegrationsService.Application.Repositories;

public sealed class KeywordDataRepository(IntegrationsDbContext db)
{
    public async Task<JsonDocument?> ReadLatestAsync(
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        var json = await db.KeywordData.AsNoTracking()
            .Where(x => x.PropertyId == propertyId)
            .OrderByDescending(x => x.Id)
            .Select(x => x.Data)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(json) ? null : JsonDocument.Parse(json);
    }

    public async Task<IReadOnlyList<KeywordHistoryPoint>> ReadHistoryAsync(
        long propertyId,
        string keyword,
        int limit = 30,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 90);
        var rows = await db.KeywordHistory.AsNoTracking()
            .Where(x => x.PropertyId == propertyId && x.Keyword == keyword)
            .OrderByDescending(x => x.Id)
            .Take(limit)
            .Select(x => new KeywordHistoryPoint
            {
                FetchedAt = x.FetchedAt.HasValue ? x.FetchedAt.Value.ToString("O") : "",
                Position = x.Position,
                Clicks = x.Clicks,
                Impressions = x.Impressions,
                Ctr = x.Ctr,
            })
            .ToListAsync(cancellationToken);

        rows.Reverse();
        return rows;
    }

    public async Task<IReadOnlyDictionary<string, IReadOnlyList<KeywordHistoryPoint>>> ReadHistoryBatchAsync(
        long propertyId,
        IReadOnlyList<string> keywords,
        int limit = 30,
        CancellationToken cancellationToken = default)
    {
        var results = new Dictionary<string, IReadOnlyList<KeywordHistoryPoint>>(StringComparer.Ordinal);
        foreach (var keyword in keywords)
        {
            results[keyword] = await ReadHistoryAsync(propertyId, keyword, limit, cancellationToken);
        }

        return results;
    }
}

public sealed class KeywordHistoryPoint
{
    public string FetchedAt { get; init; } = "";

    public double? Position { get; init; }

    public long? Clicks { get; init; }

    public long? Impressions { get; init; }

    public double? Ctr { get; init; }
}
