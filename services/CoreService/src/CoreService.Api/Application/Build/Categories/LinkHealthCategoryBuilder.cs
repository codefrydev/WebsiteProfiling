using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build.Categories;

public static class LinkHealthCategoryBuilder
{
    public static ReportCategory Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyList<(string From, string To)> edges,
        IReadOnlyList<Dictionary<string, string>> issuesBroken,
        IReadOnlyList<Dictionary<string, string>> issuesRedirects)
    {
        var issues = new List<CategoryIssue>();
        var deductions = new List<(int, bool)>();

        foreach (var b in issuesBroken.Take(30))
        {
            var status = b.GetValueOrDefault("status", "");
            var priority = status.StartsWith('5') ? "Critical" : "High";
            issues.Add(CategoryHelpers.Issue(
                $"Broken URL: {status}",
                b.GetValueOrDefault("url", ""),
                priority,
                "Fix or remove the link; return 200 or redirect to a valid URL."));
        }

        var brokenUrlSet = issuesBroken
            .Select(b => b.GetValueOrDefault("url", "").Trim())
            .Where(u => !string.IsNullOrEmpty(u))
            .ToHashSet(StringComparer.Ordinal);
        issues.AddRange(CategoryHelpers.BrokenLinkSources(edges, brokenUrlSet));

        if (issuesBroken.Count > 0)
        {
            deductions.Add((Math.Min(30, issuesBroken.Count * 2), true));
        }

        foreach (var r in issuesRedirects.Take(20))
        {
            issues.Add(CategoryHelpers.Issue(
                $"Redirect: {r.GetValueOrDefault("status", "")} to {r.GetValueOrDefault("final_url", "")}",
                r.GetValueOrDefault("url", ""),
                "Medium",
                "Prefer direct URLs or shorten redirect chains."));
        }

        if (issuesRedirects.Count > 0)
        {
            deductions.Add((Math.Min(15, issuesRedirects.Count), true));
        }

        if (rows.Any(r => r.RedirectChainLength.HasValue))
        {
            var longChains = rows.Count(r => r.RedirectChainLength is >= CategoryHelpers.RedirectChainLong);
            if (longChains > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{longChains} URL(s) have redirect chains (2+ hops).",
                    priority: "Medium",
                    recommendation: "Consolidate redirects to a single hop where possible."));
                deductions.Add((Math.Min(10, longChains), true));
            }
        }

        if (edges.Count > 0)
        {
            var inDeg = new Dictionary<string, int>(StringComparer.Ordinal);
            var nodes = new HashSet<string>(StringComparer.Ordinal);
            foreach (var (src, tgt) in edges)
            {
                nodes.Add(src);
                nodes.Add(tgt);
                inDeg[tgt] = inDeg.GetValueOrDefault(tgt) + 1;
            }

            var orphans = nodes.Where(n => inDeg.GetValueOrDefault(n) == 0).ToList();
            if (orphans.Count > nodes.Count * 0.3)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"Many pages have no internal links pointing to them ({orphans.Count}).",
                    priority: "Low",
                    recommendation: "Add internal links to important pages to improve crawlability and internal link equity."));
                deductions.Add((5, true));
            }

            issues.AddRange(CategoryHelpers.OrphanHubSuggestions(edges, orphans.Take(15).ToList()));
        }

        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "link_health",
            "Link Health",
            CategoryHelpers.ScoreDeductions(100, deductions),
            sorted,
            CategoryHelpers.RecommendationsFromIssues(sorted));
    }
}
