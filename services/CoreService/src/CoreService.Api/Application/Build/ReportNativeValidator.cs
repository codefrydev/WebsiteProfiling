using System.Text.Json;

namespace CoreService.Api.Application.Build;

/// <summary>
/// Validates native slices against Python bridge payloads (Phase 2 parity checks).
/// </summary>
public static class ReportNativeValidator
{
    public static List<string> ValidateUrlCounts(JsonElement bridgePayload, int crawlRowCount)
    {
        var warnings = new List<string>();
        if (bridgePayload.ValueKind != JsonValueKind.Object)
        {
            return warnings;
        }

        var linkCount = 0;
        if (bridgePayload.TryGetProperty("links", out var links) && links.ValueKind == JsonValueKind.Array)
        {
            linkCount = links.GetArrayLength();
        }

        var totalUrls = 0;
        if (bridgePayload.TryGetProperty("summary", out var summary)
            && summary.ValueKind == JsonValueKind.Object
            && summary.TryGetProperty("total_urls", out var totalEl)
            && totalEl.TryGetInt32(out var totalParsed))
        {
            totalUrls = totalParsed;
        }

        var pagesCrawled = 0;
        if (bridgePayload.TryGetProperty("report_meta", out var meta)
            && meta.ValueKind == JsonValueKind.Object
            && meta.TryGetProperty("crawl_scope", out var scope)
            && scope.ValueKind == JsonValueKind.Object
            && scope.TryGetProperty("pages_crawled", out var pagesEl)
            && pagesEl.TryGetInt32(out var pagesParsed))
        {
            pagesCrawled = pagesParsed;
        }

        var counts = new HashSet<int> { linkCount, totalUrls, pagesCrawled, crawlRowCount };
        if (counts.Count > 1)
        {
            warnings.Add(
                $"report count mismatch: links={linkCount}, summary.total_urls={totalUrls}, "
                + $"pages_crawled={pagesCrawled}, crawl_rows={crawlRowCount}");
        }

        return warnings;
    }

    public static List<string> ValidateSeoSummary(
        Dictionary<string, object?> nativeSummary,
        JsonElement bridgePayload)
    {
        var warnings = new List<string>();
        if (bridgePayload.ValueKind != JsonValueKind.Object
            || !bridgePayload.TryGetProperty("summary", out var bridgeSummary)
            || bridgeSummary.ValueKind != JsonValueKind.Object)
        {
            return warnings;
        }

        if (nativeSummary.TryGetValue("total_urls", out var nativeTotal)
            && bridgeSummary.TryGetProperty("total_urls", out var bridgeTotal)
            && bridgeTotal.TryGetInt32(out var bridgeInt)
            && Convert.ToInt32(nativeTotal) != bridgeInt)
        {
            warnings.Add(
                $"summary.total_urls mismatch: native={nativeTotal}, bridge={bridgeInt}");
        }

        return warnings;
    }

    public static List<string> ValidateCategories(
        IReadOnlyList<ReportCategory> nativeCategories,
        JsonElement bridgePayload)
    {
        var warnings = new List<string>();
        if (bridgePayload.ValueKind != JsonValueKind.Object
            || !bridgePayload.TryGetProperty("categories", out var bridgeCats)
            || bridgeCats.ValueKind != JsonValueKind.Array)
        {
            return warnings;
        }

        var bridgeIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var cat in bridgeCats.EnumerateArray())
        {
            if (cat.ValueKind == JsonValueKind.Object
                && cat.TryGetProperty("id", out var idEl)
                && idEl.ValueKind == JsonValueKind.String)
            {
                bridgeIds.Add(idEl.GetString() ?? "");
            }
        }

        var nativeIds = nativeCategories.Select(c => c.Id).ToHashSet(StringComparer.Ordinal);
        foreach (var id in bridgeIds)
        {
            if (!string.IsNullOrEmpty(id) && !nativeIds.Contains(id))
            {
                warnings.Add($"categories missing native id: {id}");
            }
        }

        return warnings;
    }

    private static readonly HashSet<string> IssueCountExemptCategoryIds = new(StringComparer.Ordinal)
    {
        // ML bundle (duplicates, language mix) is still built in Python during bridge mode.
        "intelligence",
    };

    public static List<string> ValidateCategoryIssueCounts(
        IReadOnlyList<ReportCategory> nativeCategories,
        JsonElement bridgePayload)
    {
        var warnings = new List<string>();
        if (bridgePayload.ValueKind != JsonValueKind.Object
            || !bridgePayload.TryGetProperty("categories", out var bridgeCats)
            || bridgeCats.ValueKind != JsonValueKind.Array)
        {
            return warnings;
        }

        var nativeById = nativeCategories.ToDictionary(c => c.Id, StringComparer.Ordinal);
        foreach (var cat in bridgeCats.EnumerateArray())
        {
            if (cat.ValueKind != JsonValueKind.Object
                || !cat.TryGetProperty("id", out var idEl)
                || idEl.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var id = idEl.GetString() ?? "";
            if (string.IsNullOrEmpty(id) || IssueCountExemptCategoryIds.Contains(id))
            {
                continue;
            }

            if (!nativeById.TryGetValue(id, out var nativeCat))
            {
                continue;
            }

            var bridgeIssueCount = cat.TryGetProperty("issues", out var issuesEl) && issuesEl.ValueKind == JsonValueKind.Array
                ? issuesEl.GetArrayLength()
                : 0;
            if (bridgeIssueCount != nativeCat.Issues.Count)
            {
                warnings.Add(
                    $"categories[{id}] issue count mismatch: native={nativeCat.Issues.Count}, bridge={bridgeIssueCount}");
            }
        }

        return warnings;
    }

    public static List<string> ValidateLinksCount(
        int nativeLinkCount,
        int crawlRowCount,
        JsonElement bridgePayload)
    {
        var warnings = new List<string>();
        if (bridgePayload.ValueKind != JsonValueKind.Object
            || !bridgePayload.TryGetProperty("links", out var links)
            || links.ValueKind != JsonValueKind.Array)
        {
            return warnings;
        }

        var bridgeCount = links.GetArrayLength();
        if (bridgeCount != nativeLinkCount)
        {
            warnings.Add($"links count mismatch: native={nativeLinkCount}, bridge={bridgeCount}");
        }

        if (nativeLinkCount != crawlRowCount)
        {
            warnings.Add($"links vs crawl rows mismatch: links={nativeLinkCount}, crawl_rows={crawlRowCount}");
        }

        return warnings;
    }

    public static List<string> ValidateContentAnalyticsThinPages(
        Dictionary<string, object?> nativeAnalytics,
        JsonElement bridgePayload)
    {
        var warnings = new List<string>();
        if (bridgePayload.ValueKind != JsonValueKind.Object
            || !bridgePayload.TryGetProperty("content_analytics", out var bridgeCa)
            || bridgeCa.ValueKind != JsonValueKind.Object)
        {
            return warnings;
        }

        var nativeCount = 0;
        if (nativeAnalytics.TryGetValue("thin_pages", out var nativeThin)
            && nativeThin is List<Dictionary<string, object?>> nativeList)
        {
            nativeCount = nativeList.Count;
        }

        var bridgeCount = 0;
        if (bridgeCa.TryGetProperty("thin_pages", out var bridgeThin) && bridgeThin.ValueKind == JsonValueKind.Array)
        {
            bridgeCount = bridgeThin.GetArrayLength();
        }

        if (nativeCount != bridgeCount)
        {
            warnings.Add($"content_analytics.thin_pages count mismatch: native={nativeCount}, bridge={bridgeCount}");
        }

        return warnings;
    }
}
