using System.Text.Json;
using CoreService.Api.Application.Build;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class CategoryBuilderGoldenTests
{
    private static List<CrawlRow> LoadFixtureRows()
    {
        var root = FindRepoRoot();
        var json = File.ReadAllText(Path.Combine(root, "tests/fixtures/report/minimal_crawl.json"));
        using var doc = JsonDocument.Parse(json);
        var rows = new List<CrawlRow>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            var url = el.GetProperty("url").GetString()!.Trim();
            rows.Add(CrawlRowMapper.MergeRow(url, "static", el.GetRawText()));
        }

        return rows;
    }

    private static HashSet<(string CatId, string MsgPrefix, string Priority)> IssueFingerprints(
        IEnumerable<ReportCategory> categories)
    {
        var fps = new HashSet<(string, string, string)>();
        foreach (var cat in categories)
        {
            foreach (var issue in cat.Issues)
            {
                var msg = issue.Message.ToLowerInvariant();
                var prefix = msg.Length > 80 ? msg[..80] : msg;
                fps.Add((cat.Id, prefix, issue.Priority));
            }
        }

        return fps;
    }

    [Fact]
    public void BuildCategories_golden_fingerprints_match_python()
    {
        var rows = LoadFixtureRows();
        var edges = new List<(string From, string To)>
        {
            ("https://example.com/", "https://example.com/thin"),
            ("https://example.com/a", "https://example.com/broken"),
        };

        var summarySeo = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {
              "issues": {
                "broken": [{"url": "https://example.com/broken", "status": "404"}],
                "redirects": [{"url": "https://example.com/redirect", "status": "301", "final_url": "https://example.com/"}]
              }
            }
            """)!;

        var siteLevel = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {"robots_present": true, "sitemap_present": true, "sitemap_valid": true}
            """)!;

        var lh = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """{"median_metrics": {"performance_score": 0.85}, "top_failures": []}""")!;

        var crux = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """{"ok": true, "pass": {"lcp": false, "inp": true, "cls": true}}""")!;

        var builder = new CategoryBuilder();
        var categories = builder.BuildCategories(
            rows,
            edges,
            summarySeo,
            siteLevel,
            "https://example.com/",
            lh,
            crux);

        var fps = IssueFingerprints(categories);
        Assert.Contains(fps, fp => fp.Item2.Contains("self-referencing"));
        Assert.Contains(fps, fp => fp.Item2.Contains("noindex"));
        Assert.Contains(fps, fp => fp.Item2.Contains("soft 404"));
        Assert.Contains(fps, fp => fp.Item2.Contains("broken url"));
        Assert.Contains(fps, fp => fp.Item2.Contains("crux"));

        var indexation = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {
              "lists": {"sitemap_only": ["https://example.com/missing-page"]},
              "sitemap_urls": ["https://example.com/", "https://example.com/missing-page"]
            }
            """)!;

        var mutable = categories.ToList();
        builder.MergeIndexationIssues(mutable, rows, indexation);
        var mergedFps = IssueFingerprints(mutable);
        Assert.Contains(mergedFps, fp => fp.Item2.Contains("not crawled"));

        var ids = mutable.Select(c => c.Id).ToHashSet();
        foreach (var required in new[]
                 {
                     "technical_seo",
                     "core_web_vitals",
                     "link_health",
                     "security",
                     "performance",
                     "intelligence",
                 })
        {
            Assert.Contains(required, ids);
        }
    }

    [Fact]
    public void BuildCategories_missing_site_files_are_low_priority_in_technical_seo()
    {
        var rows = LoadFixtureRows();
        var siteLevel = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {
              "robots_present": true,
              "sitemap_present": true,
              "sitemap_valid": true,
              "ads_txt_present": false,
              "security_txt_present": false,
              "enable_ads_txt_check": true,
              "enable_security_txt_check": true
            }
            """)!;

        var builder = new CategoryBuilder();
        var categories = builder.BuildCategories(
            rows,
            [],
            JsonSerializer.Deserialize<Dictionary<string, object?>>("""{"issues": {}}""")!,
            siteLevel,
            "https://example.com/");

        var tech = categories.Single(c => c.Id == "technical_seo");
        var msgs = string.Join(" ", tech.Issues.Select(i => i.Message));
        Assert.Contains("ads.txt", msgs, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("security.txt", msgs, StringComparison.OrdinalIgnoreCase);

        var adsPriority = tech.Issues
            .Where(i => i.Message.Contains("ads.txt", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.Priority)
            .ToHashSet();
        Assert.Contains("Low", adsPriority);
    }

    private static string FindRepoRoot()
    {
        var dir = AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            if (File.Exists(Path.Combine(dir, "tests/fixtures/report/minimal_crawl.json")))
            {
                return dir;
            }

            dir = Directory.GetParent(dir)?.FullName ?? "";
        }

        throw new InvalidOperationException("Could not locate repo root for fixtures.");
    }

    internal static string FindRepoRootForTests() => FindRepoRoot();
}
