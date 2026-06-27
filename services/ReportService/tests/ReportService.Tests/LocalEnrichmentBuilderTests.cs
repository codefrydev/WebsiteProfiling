using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class LocalEnrichmentBuilderTests
{
    [Fact]
    public void Simhash64_identical_text_produces_same_hash()
    {
        var text = string.Join(' ', Enumerable.Repeat("hello world", 10));
        var a = LocalEnrichmentBuilder.Simhash64(text);
        var b = LocalEnrichmentBuilder.Simhash64(text);
        Assert.Equal(a, b);
        Assert.NotEqual(0UL, a);
    }

    [Fact]
    public void ComputeDuplicateGroups_disabled_returns_empty()
    {
        var rows = new List<CrawlRow>
        {
            MakeRow("https://example.com/a", "Best SEO Tools Guide for marketers everywhere today"),
            MakeRow("https://example.com/b", "Best SEO Tools Guide for marketers everywhere today"),
        };

        var (groups, mapping, warnings) = LocalEnrichmentBuilder.ComputeDuplicateGroups(
            rows,
            new Dictionary<string, string> { ["enable_duplicate_detection"] = "false" });

        Assert.Empty(groups);
        Assert.Empty(mapping);
        Assert.Empty(warnings);
    }

    [Fact]
    public void ComputeDuplicateGroups_fuzzy_merge_clusters_near_duplicates()
    {
        var body = string.Join(' ', Enumerable.Repeat("seo tools", 50));
        var rows = new List<CrawlRow>
        {
            MakeRow(
                "https://example.com/a",
                "Best SEO Tools Guide",
                meta: "A guide to SEO tools for marketers",
                h1: "SEO Tools",
                excerpt: body),
            MakeRow(
                "https://example.com/b",
                "Best SEO Tools Guide",
                meta: "A guide to SEO tools for marketers",
                h1: "SEO Tools",
                excerpt: body),
        };

        var cfg = new Dictionary<string, string>
        {
            ["enable_duplicate_detection"] = "true",
            ["analysis_fuzzy_threshold"] = "90",
            ["analysis_dup_max_pages"] = "100",
        };

        var (groups, mapping, warnings) = LocalEnrichmentBuilder.ComputeDuplicateGroups(rows, cfg);

        Assert.NotEmpty(groups);
        Assert.Equal(mapping["https://example.com/a"], mapping["https://example.com/b"]);
        Assert.Empty(warnings);
    }

    [Fact]
    public void ComputeDuplicateGroups_emits_warnings_when_url_caps_exceeded()
    {
        var rows = Enumerable.Range(0, 3)
            .Select(i => MakeRow(
                $"https://example.com/p{i}",
                $"Unique page title number {i} with enough content for duplicate detection",
                excerpt: string.Join(' ', Enumerable.Repeat("content", 50))))
            .ToList();

        var cfg = new Dictionary<string, string>
        {
            ["enable_duplicate_detection"] = "true",
            ["analysis_simhash_hamming"] = "3",
            ["analysis_simhash_max_urls"] = "1",
            ["analysis_fuzzy_max_urls"] = "1",
        };

        var (_, _, warnings) = LocalEnrichmentBuilder.ComputeDuplicateGroups(rows, cfg);

        Assert.Contains(warnings, w => w.Contains("SimHash", StringComparison.Ordinal));
        Assert.Contains(warnings, w => w.Contains("fuzzy", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ComputeLanguageSignals_disabled_returns_empty()
    {
        var rows = new List<CrawlRow>
        {
            MakeRow("https://example.com/en", "This is an English page about search engine optimization tools."),
        };

        var (byUrl, summary) = LocalEnrichmentBuilder.ComputeLanguageSignals(
            rows,
            new Dictionary<string, string> { ["enable_language_detection"] = "false" });

        Assert.Empty(byUrl);
        Assert.False(summary["mixed_site"] as bool?);
    }

    [Fact]
    public void ComputeLanguageSignals_detects_english_page()
    {
        var rows = new List<CrawlRow>
        {
            MakeRow(
                "https://example.com/en",
                "This is an English page about search engine optimization tools and website audits for marketing teams."),
        };

        var (byUrl, summary) = LocalEnrichmentBuilder.ComputeLanguageSignals(
            rows,
            new Dictionary<string, string> { ["enable_language_detection"] = "true" });

        Assert.True(byUrl.ContainsKey("https://example.com/en"));
        Assert.Equal("en", byUrl["https://example.com/en"]);
        Assert.True(summary.ContainsKey("detected_pages"));
    }

    [Fact]
    public void RunLocalEnrichment_empty_rows_returns_empty_bundle()
    {
        var bundle = LocalEnrichmentBuilder.RunLocalEnrichment([], new Dictionary<string, string>());

        Assert.Empty(Assert.IsAssignableFrom<IEnumerable<object>>(bundle["content_duplicates"]));
        Assert.Empty(Assert.IsType<Dictionary<string, string>>(bundle["url_duplicate_group_id"]));
        Assert.Empty(Assert.IsType<List<string>>(bundle["ml_errors"]));
    }

    [Fact]
    public void RunLocalEnrichment_collects_duplicate_and_language_results()
    {
        var body = string.Join(' ', Enumerable.Repeat("seo tools", 50));
        var rows = new List<CrawlRow>
        {
            MakeRow(
                "https://example.com/a",
                "Best SEO Tools Guide",
                meta: "A guide to SEO tools for marketers",
                h1: "SEO Tools",
                excerpt: body),
            MakeRow(
                "https://example.com/b",
                "Best SEO Tools Guide",
                meta: "A guide to SEO tools for marketers",
                h1: "SEO Tools",
                excerpt: body),
        };

        var cfg = new Dictionary<string, string>
        {
            ["enable_duplicate_detection"] = "true",
            ["enable_language_detection"] = "true",
            ["analysis_fuzzy_threshold"] = "90",
        };

        var bundle = LocalEnrichmentBuilder.RunLocalEnrichment(rows, cfg);

        var dups = Assert.IsType<List<Dictionary<string, object?>>>(bundle["content_duplicates"]);
        Assert.NotEmpty(dups);
        var langMap = Assert.IsType<Dictionary<string, string>>(bundle["language_by_url"]);
        Assert.NotEmpty(langMap);
    }

    [Fact]
    public void NormalizeFingerprintText_concatenates_and_lowercases_fields()
    {
        var row = new CrawlRow
        {
            Url = "https://example.com/",
            Title = "  Hello World  ",
            H1 = "H1",
            OgDescription = "OG",
            TwitterTitle = "Tw",
            ContentExcerpt = "Body text",
            TopKeywords = """[{"word": "kw1"}]""",
        };

        var text = FingerprintTextHelper.NormalizeFingerprintText(row);

        Assert.Contains("hello world", text);
        Assert.Contains("kw1", text);
        Assert.DoesNotContain("  ", text);
    }

    private static CrawlRow MakeRow(
        string url,
        string title,
        string? meta = null,
        string? h1 = null,
        string? excerpt = null) =>
        new()
        {
            Url = url,
            Status = "200",
            ContentType = "text/html",
            Title = title,
            MetaDescription = meta ?? "Default meta description long enough for fingerprinting",
            H1 = h1 ?? title,
            ContentExcerpt = excerpt ?? string.Join(' ', Enumerable.Repeat("content excerpt text", 20)),
        };
}

public sealed class NativeReportPayloadAssemblerMlTests
{
    [Fact]
    public void MergeAnalysisIntoPayload_applies_duplicate_and_language_fields_to_links()
    {
        var links = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["url"] = "https://example.com/a",
                ["page_analysis"] = new Dictionary<string, object?>(),
            },
        };

        var payload = new Dictionary<string, object?> { ["links"] = links };
        var mlBundle = LocalEnrichmentBuilder.RunLocalEnrichment(
            new List<CrawlRow>
            {
                new()
                {
                    Url = "https://example.com/a",
                    Status = "200",
                    ContentType = "text/html",
                    Title = "English SEO audit guide for marketing teams and analysts",
                    MetaDescription = "Detailed English SEO audit guide for marketing teams and analysts worldwide",
                    H1 = "SEO audit guide",
                    ContentExcerpt = string.Join(' ', Enumerable.Repeat("english seo audit guide", 20)),
                },
            },
            new Dictionary<string, string> { ["enable_language_detection"] = "true" });

        NativeReportPayloadAssembler.MergeAnalysisIntoPayload(payload, mlBundle);

        Assert.NotNull(payload.GetValueOrDefault("language_summary"));
        var link = links[0];
        Assert.True(link.ContainsKey("detected_language"));
    }
}
