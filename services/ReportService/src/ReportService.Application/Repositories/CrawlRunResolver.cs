namespace ReportService.Application.Repositories;

/// <summary>
/// Resolves which crawl run to use for report/Lighthouse (Python <c>resolve_crawl_run_id_for_cfg</c> parity).
/// </summary>
public static class CrawlRunResolver
{
    public static async Task<long?> ResolveAsync(
        CrawlRepository repository,
        long? propertyId,
        string? startUrl,
        long? explicitRunId = null,
        CancellationToken cancellationToken = default)
    {
        if (explicitRunId is not null)
        {
            return explicitRunId.Value;
        }

        if (propertyId is > 0)
        {
            var forProperty = await repository.GetLatestCrawlRunIdForPropertyAsync(propertyId.Value, cancellationToken);
            if (forProperty is not null)
            {
                return forProperty;
            }
        }

        var site = (startUrl ?? "").Trim();
        if (site.Length > 0)
        {
            var forStartUrl = await repository.GetLatestCrawlRunIdForStartUrlAsync(site, cancellationToken);
            if (forStartUrl is not null)
            {
                return forStartUrl;
            }
        }

        return await repository.GetLatestCrawlRunIdAsync(cancellationToken);
    }

    internal static string NormalizeStartUrlKey(string url)
    {
        var trimmed = (url ?? "").Trim();
        if (trimmed.Length == 0)
        {
            return "";
        }

        if (!trimmed.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            && !trimmed.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = $"https://{trimmed}";
        }

        return trimmed.TrimEnd('/').ToLowerInvariant();
    }
}
