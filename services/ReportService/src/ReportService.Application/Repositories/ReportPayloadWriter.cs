using System.Text.Json;
using ReportService.Application.Build;
using ReportService.Application.Persistence;
using ReportService.Domain.Entities;

namespace ReportService.Application.Repositories;

public sealed class ReportPayloadWriter(ReportDbContext db)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = false,
    };

    public async Task<long> WriteAsync(
        Dictionary<string, object?> reportData,
        long? propertyId,
        CancellationToken cancellationToken = default)
    {
        var siteName = reportData.GetValueOrDefault("site_name")?.ToString() ?? "";
        var canonicalDomain = ExtractCanonicalDomain(reportData);
        var json = JsonSerializer.Serialize(reportData, JsonOptions);

        var entity = new ReportPayload
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            SiteName = siteName,
            CanonicalDomain = canonicalDomain,
            Data = json,
        };

        db.ReportPayloads.Add(entity);
        await db.SaveChangesAsync(cancellationToken);

        try
        {
            await WriteHealthSnapshotAsync(entity.Id, propertyId, canonicalDomain, reportData, cancellationToken);
        }
        catch
        {
            // Snapshot failure must not roll back report_payload (Python savepoint parity).
        }

        return entity.Id;
    }

    private async Task WriteHealthSnapshotAsync(
        long reportId,
        long? propertyId,
        string? canonicalDomain,
        Dictionary<string, object?> reportData,
        CancellationToken cancellationToken)
    {
        if (!reportData.TryGetValue("categories", out var catsObj)
            || catsObj is not List<Dictionary<string, object?>> categories)
        {
            return;
        }

        var (categoryScores, healthScore) = reportData.TryGetValue("summary", out var summaryObj)
            && summaryObj is Dictionary<string, object?> summary
            && summary.TryGetValue("site_health_score", out var hsObj)
            && hsObj is int hsFromSummary
            ? (
                summary.TryGetValue("category_scores", out var csObj) && csObj is Dictionary<string, double> csDict
                    ? csDict
                    : SiteHealthScoreBuilder.ComputeWithCategoryScores(categories).CategoryScores,
                (int?)hsFromSummary)
            : SiteHealthScoreBuilder.ComputeWithCategoryScores(categories);

        var issueCounts = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["Critical"] = 0, ["High"] = 0, ["Medium"] = 0, ["Low"] = 0,
        };

        foreach (var cat in categories)
        {
            if (cat.TryGetValue("issues", out var issuesObj) && issuesObj is IEnumerable<object> issueList)
            {
                foreach (var issueObj in issueList)
                {
                    var priority = issueObj switch
                    {
                        Dictionary<string, string> sdict => sdict.GetValueOrDefault("priority", "Medium"),
                        Dictionary<string, object?> odict => odict.GetValueOrDefault("priority")?.ToString() ?? "Medium",
                        _ => "Medium",
                    };
                    issueCounts[priority] = issueCounts.GetValueOrDefault(priority) + 1;
                }
            }
        }

        db.AuditHealthSnapshots.Add(new AuditHealthSnapshot
        {
            PropertyId = propertyId,
            ReportId = reportId,
            CanonicalDomain = canonicalDomain,
            HealthScore = healthScore,
            CategoryScores = JsonSerializer.Serialize(categoryScores),
            IssueCounts = JsonSerializer.Serialize(issueCounts),
            GeneratedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    private static string ExtractCanonicalDomain(Dictionary<string, object?> reportData)
    {
        if (reportData.TryGetValue("report_meta", out var metaObj)
            && metaObj is Dictionary<string, object?> meta
            && meta.TryGetValue("start_url", out var start)
            && start is string startUrl
            && Uri.TryCreate(startUrl, UriKind.Absolute, out var uri))
        {
            return uri.Host.ToLowerInvariant();
        }

        if (reportData.TryGetValue("top_pages", out var topObj)
            && topObj is List<Dictionary<string, object?>> topPages
            && topPages.Count > 0
            && topPages[0].TryGetValue("url", out var u)
            && u is string url
            && Uri.TryCreate(url, UriKind.Absolute, out var topUri))
        {
            return topUri.Host.ToLowerInvariant();
        }

        if (reportData.TryGetValue("links", out var linksObj)
            && linksObj is List<Dictionary<string, object?>> links
            && links.Count > 0
            && links[0].TryGetValue("url", out var lu)
            && lu is string linkUrl
            && Uri.TryCreate(linkUrl, UriKind.Absolute, out var linkUri))
        {
            return linkUri.Host.ToLowerInvariant();
        }

        return "";
    }
}
