using System.Text.Json;
using IntegrationsService.Application.Repositories;

namespace IntegrationsService.Application.Google;

public sealed class PageCompareService(
    GoogleDataReadRepository googleData,
    PageGoogleSnapshotRepository pageSnapshots)
{
    public async Task<PageCompareArm?> LoadArmAsync(
        string snapType,
        long id,
        string pageUrl,
        CancellationToken cancellationToken = default)
    {
        if (id <= 0)
        {
            return null;
        }

        var isLive = string.Equals(snapType, "live", StringComparison.OrdinalIgnoreCase);
        if (isLive)
        {
            var row = await pageSnapshots.ReadCompareRowAsync(id, cancellationToken);
            if (row is null)
            {
                return null;
            }

            using var doc = JsonDocument.Parse(row.DataJson);
            var root = doc.RootElement;
            return new PageCompareArm
            {
                Type = "live",
                Id = row.Id,
                FetchedAt = row.FetchedAt,
                Gsc = PageLookupService.ReadOptionalObject(root, "gsc"),
                Ga4 = PageLookupService.ReadOptionalObject(root, "ga4"),
            };
        }

        var siteRow = await googleData.ReadSnapshotByIdAsync(id, cancellationToken);
        if (siteRow is null)
        {
            return null;
        }

        using var siteDoc = siteRow.ParseData();
        var slice = PageLookupService.SliceFromGoogleRow(siteDoc.RootElement, pageUrl);
        return new PageCompareArm
        {
            Type = "snapshot",
            Id = siteRow.Id,
            FetchedAt = siteRow.FetchedAt ?? slice.FetchedAt?.ToString(),
            Gsc = slice.Gsc,
            Ga4 = slice.Ga4,
        };
    }
}
