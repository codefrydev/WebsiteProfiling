using System.Text.Json;
using System.Text.Json.Nodes;
using CoreService.Api.Application.Build.Categories;
using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build;

/// <summary>
/// Issue category assembly for report payloads. Incremental port from Python reporting/categories/*.
/// </summary>
public sealed class CategoryBuilder
{
    /// <summary>True when all Python build_categories() entries are ported.</summary>
    public bool IsNativeComplete => true;

    public IReadOnlyList<ReportCategory> BuildCategories(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyList<(string From, string To)> edges,
        IReadOnlyDictionary<string, object?> summarySeo,
        IReadOnlyDictionary<string, object?> siteLevel,
        string startUrl,
        IReadOnlyDictionary<string, object?>? lighthouseSummary = null,
        IReadOnlyDictionary<string, object?>? cruxSummary = null,
        IReadOnlyDictionary<string, JsonNode>? lighthouseByUrl = null,
        IReadOnlyDictionary<string, object?>? mlBundle = null,
        IReadOnlyList<Dictionary<string, object?>>? securityFindings = null)
    {
        var (broken, redirects) = ParseSeoIssues(summarySeo);

        var categories = new List<ReportCategory>
        {
            TechnicalSeoCategoryBuilder.Build(rows, siteLevel),
            CoreWebVitalsCategoryBuilder.Build(lighthouseSummary, cruxSummary),
            PerformanceCategoryBuilder.Build(rows),
            HtmlAccessibilityCategoryBuilder.Build(rows, lighthouseByUrl, lighthouseSummary),
            LinkHealthCategoryBuilder.Build(rows, edges, broken, redirects),
            MobileCategoryBuilder.Build(rows, lighthouseByUrl),
            SecurityCategoryBuilder.Build(rows, startUrl, securityFindings),
            IntelligenceCategoryBuilder.Build(mlBundle),
        };

        return categories;
    }

    public void MergeIndexationIssues(
        IList<ReportCategory> categories,
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, object?>? indexation) =>
        CategoryHelpers.MergeIndexationIssues(categories, rows, indexation);

    public void MergeSubdomainIssues(
        IList<ReportCategory> categories,
        IReadOnlyDictionary<string, object?>? subdomains) =>
        CategoryHelpers.MergeSubdomainIssues(categories, subdomains);

    public static IReadOnlyList<(string From, string To)> BuildEdges(
        IReadOnlyList<CrawlRow> rows,
        bool sameDomainOnly = true)
    {
        var inputs = rows.Select(r => new CrawlRowEdgesInput(
            r.Url,
            new Dictionary<string, string>
            {
                ["outlink_targets"] = r.OutlinkTargets ?? "",
            })).ToList();

        return EdgesBuilder.BuildFromSerializedColumns(inputs, sameDomainOnly);
    }

    private static (List<Dictionary<string, string>> Broken, List<Dictionary<string, string>> Redirects)
        ParseSeoIssues(IReadOnlyDictionary<string, object?> summarySeo)
    {
        var broken = new List<Dictionary<string, string>>();
        var redirects = new List<Dictionary<string, string>>();

        if (!summarySeo.TryGetValue("issues", out var issuesObj) || issuesObj is null)
        {
            return (broken, redirects);
        }

        if (issuesObj is Dictionary<string, List<Dictionary<string, string>>> issuesDict)
        {
            issuesDict.TryGetValue("broken", out var b);
            issuesDict.TryGetValue("redirects", out var r);
            return (b ?? [], r ?? []);
        }

        if (issuesObj is Dictionary<string, object?> issuesObjDict)
        {
            if (issuesObjDict.TryGetValue("broken", out var bObj)
                && bObj is List<Dictionary<string, string>> bList)
            {
                broken = bList;
            }

            if (issuesObjDict.TryGetValue("redirects", out var rObj)
                && rObj is List<Dictionary<string, string>> rList)
            {
                redirects = rList;
            }

            return (broken, redirects);
        }

        if (issuesObj is not JsonElement issues || issues.ValueKind != JsonValueKind.Object)
        {
            return (broken, redirects);
        }

        if (issues.TryGetProperty("broken", out var brokenEl) && brokenEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in brokenEl.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                broken.Add(new Dictionary<string, string>
                {
                    ["url"] = item.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "",
                    ["status"] = item.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "",
                });
            }
        }

        if (issues.TryGetProperty("redirects", out var redirEl) && redirEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in redirEl.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                redirects.Add(new Dictionary<string, string>
                {
                    ["url"] = item.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "",
                    ["status"] = item.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "",
                    ["final_url"] = item.TryGetProperty("final_url", out var f) ? f.GetString() ?? "" : "",
                });
            }
        }

        return (broken, redirects);
    }
}
