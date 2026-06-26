using System.Text.Json;
using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class SeoSummaryBuilderTests
{
    private static List<CrawlRow> LoadFixtureRows()
    {
        var root = FindRepoRoot();
        var json = File.ReadAllText(Path.Combine(root, "tests/fixtures/report/minimal_crawl.json"));
        using var doc = JsonDocument.Parse(json);
        var rows = new List<CrawlRow>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            rows.Add(new CrawlRow
            {
                Url = el.GetProperty("url").GetString()!.Trim().TrimEnd('/'),
                Status = el.TryGetProperty("status", out var st) ? st.GetString() : null,
                Title = el.TryGetProperty("title", out var title) ? title.GetString() : null,
                MetaDescription = el.TryGetProperty("meta_description", out var md) ? md.GetString() : null,
                MetaDescriptionLen = el.TryGetProperty("meta_description", out var mdl)
                    ? (mdl.GetString() ?? "").Length
                    : null,
                H1 = el.TryGetProperty("h1", out var h1) ? h1.GetString() : null,
                H1Count = el.TryGetProperty("h1", out var h1c)
                    ? string.IsNullOrWhiteSpace(h1c.GetString()) ? 0 : 1
                    : null,
                WordCount = el.TryGetProperty("word_count", out var wc) && wc.TryGetInt32(out var wci) ? wci : null,
                ContentLength = el.TryGetProperty("word_count", out var cl) && cl.TryGetInt32(out var cli) ? cli * 5 : null,
                Outlinks = 0,
                PageAnalysisJson = el.TryGetProperty("page_analysis", out var pa) ? pa.GetString() : null,
            });
        }

        return rows;
    }

    [Fact]
    public void Compute_counts_urls_and_redirects()
    {
        var rows = LoadFixtureRows();
        var result = SeoSummaryBuilder.Compute(rows);

        Assert.Equal(5, result.Summary["total_urls"]);
        Assert.Equal(4, result.Summary["count_2xx"]);
        Assert.Equal(1, result.Summary["count_3xx"]);
        Assert.Single(result.Issues["redirects"]);
    }

    [Fact]
    public void BuildHreflangSummary_counts_hreflang_pages()
    {
        var rows = LoadFixtureRows();
        var summary = ReportMetadataBuilder.BuildHreflangSummary(rows);

        Assert.Equal(4, summary["pages_200"]);
        Assert.Equal(1, (int)summary["pages_with_hreflang_links"]!);
    }

    [Fact]
    public void BuildUrlFingerprints_is_stable()
    {
        var rows = LoadFixtureRows();
        var fps = ReportMetadataBuilder.BuildUrlFingerprints(rows);

        Assert.Equal(5, fps.Count);
        Assert.All(fps, fp =>
        {
            Assert.False(string.IsNullOrWhiteSpace(fp["content_fingerprint"]?.ToString()));
            Assert.False(string.IsNullOrWhiteSpace(fp["structure_fingerprint"]?.ToString()));
        });
    }

    [Fact]
    public void ValidateUrlCounts_flags_mismatch()
    {
        using var doc = JsonDocument.Parse(
            """{"links":[{"url":"a"}],"summary":{"total_urls":2},"report_meta":{"crawl_scope":{"pages_crawled":3}}}""");
        var warnings = ReportNativeValidator.ValidateUrlCounts(doc.RootElement, 5);

        Assert.Single(warnings);
        Assert.Contains("mismatch", warnings[0], StringComparison.OrdinalIgnoreCase);
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
}
