using System.Text.Json;
using CoreService.Api.Domain.Integrations.Entities;
using CoreService.Api.IntegrationsApplication.Google;
using CoreService.Api.IntegrationsApplication.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.IntegrationsApplication.Repositories;

public sealed class PageGoogleSnapshotRepository(IntegrationsDbContext db)
{
    public static int MaxSnapshotsPerUrl()
    {
        var raw = (Environment.GetEnvironmentVariable("PAGE_SNAPSHOT_MAX_PER_URL") ?? "30").Trim();
        return int.TryParse(raw, out var n) ? Math.Clamp(n, 1, 200) : 30;
    }

    public async Task<long> WriteAsync(
        string pageUrl,
        JsonDocument data,
        CancellationToken cancellationToken = default)
    {
        var urlNorm = UrlJoinBuilder.NormalizeUrl(pageUrl);
        var row = new PageGoogleSnapshot
        {
            PageUrl = pageUrl.Trim(),
            UrlNorm = urlNorm,
            FetchedAt = DateTimeOffset.UtcNow,
            Data = data.RootElement.GetRawText(),
        };
        db.PageGoogleSnapshots.Add(row);
        await db.SaveChangesAsync(cancellationToken);

        var limit = MaxSnapshotsPerUrl();
        var keepIds = await db.PageGoogleSnapshots.AsNoTracking()
            .Where(p => p.UrlNorm == urlNorm)
            .OrderByDescending(p => p.FetchedAt)
            .ThenByDescending(p => p.Id)
            .Take(limit)
            .Select(p => p.Id)
            .ToListAsync(cancellationToken);

        var stale = await db.PageGoogleSnapshots
            .Where(p => p.UrlNorm == urlNorm && !keepIds.Contains(p.Id))
            .ToListAsync(cancellationToken);
        if (stale.Count > 0)
        {
            db.PageGoogleSnapshots.RemoveRange(stale);
            await db.SaveChangesAsync(cancellationToken);
        }

        return row.Id;
    }

    public async Task<GoogleSnapshotRow?> ReadCompareRowAsync(
        long snapshotId,
        CancellationToken cancellationToken = default)
    {
        var row = await db.PageGoogleSnapshots.AsNoTracking()
            .Where(p => p.Id == snapshotId)
            .Select(p => new { p.Id, p.FetchedAt, p.Data })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? null
            : new GoogleSnapshotRow(row.Id, row.FetchedAt.ToString("O"), row.Data);
    }

    public async Task<IReadOnlyList<PageLiveHistoryItem>> ListApiHistoryAsync(
        string pageUrl,
        int limit = 15,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 50);
        var urlNorm = UrlJoinBuilder.NormalizeUrl(pageUrl);
        var rows = await db.PageGoogleSnapshots.AsNoTracking()
            .Where(p => p.UrlNorm == urlNorm)
            .OrderByDescending(p => p.FetchedAt)
            .ThenByDescending(p => p.Id)
            .Take(limit)
            .Select(p => new { p.Id, p.FetchedAt, p.Data })
            .ToListAsync(cancellationToken);

        var result = new List<PageLiveHistoryItem>();
        foreach (var row in rows)
        {
            using var doc = JsonDocument.Parse(row.Data);
            var root = doc.RootElement;
            result.Add(new PageLiveHistoryItem
            {
                Id = row.Id,
                FetchedAt = row.FetchedAt.ToString("O"),
                Gsc = PageLookupService.ReadOptionalObject(root, "gsc"),
                Ga4 = PageLookupService.ReadOptionalObject(root, "ga4"),
            });
        }

        return result;
    }
}

public sealed class PageLiveHistoryItem
{
    public long Id { get; init; }

    public string FetchedAt { get; init; } = "";

    public object? Gsc { get; init; }

    public object? Ga4 { get; init; }
}
