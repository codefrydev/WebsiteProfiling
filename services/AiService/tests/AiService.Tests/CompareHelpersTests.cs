using System.Text.Json.Nodes;
using AiService.Tools.Compare;

namespace AiService.Tests;

/// <summary>Ports Python <c>reporting/compare_payload.py</c>.</summary>
public sealed class CompareHelpersTests
{
    private static JsonObject Payload(string json) => (JsonNode.Parse(json) as JsonObject)!;

    [Theory]
    [InlineData("https://Example.com/Path", "example.com/Path")]
    [InlineData("https://example.com", "example.com/")]
    [InlineData("not a url", "not a url")]
    [InlineData("", "")]
    public void NormReportUrl_normalizes_host_and_preserves_path_case(string input, string expected)
        => Assert.Equal(expected, CompareHelpers.NormReportUrl(input));

    [Fact]
    public void RoundHalfUp_rounds_half_away_from_zero()
    {
        Assert.Equal(3, CompareHelpers.RoundHalfUp(2.5));
        Assert.Equal(2, CompareHelpers.RoundHalfUp(2.4));
    }

    [Fact]
    public void ScoreFromCategories_averages_numeric_scores()
    {
        var categories = Payload("""{"categories": [{"score": 80}, {"score": 90}]}""")["categories"]!.AsArray();
        Assert.Equal(85, CompareHelpers.ScoreFromCategories(categories));
    }

    [Fact]
    public void ScoreFromCategories_returns_null_when_no_scores()
    {
        Assert.Null(CompareHelpers.ScoreFromCategories(new JsonArray()));
    }

    [Fact]
    public void BuildIssueDeltas_finds_new_and_resolved_by_url_category_message()
    {
        var current = Payload("""{"categories": [{"name": "seo", "issues": [{"url": "https://a", "message": "new one", "priority": "High"}]}]}""");
        var baseline = Payload("""{"categories": [{"name": "seo", "issues": [{"url": "https://b", "message": "old one", "priority": "Low"}]}]}""");

        var deltas = CompareHelpers.BuildIssueDeltas(current, baseline);

        Assert.Equal(2, deltas.Count);
        Assert.Contains(deltas, d => d["kind"]!.GetValue<string>() == "new" && d["url"]!.GetValue<string>() == "https://a");
        Assert.Contains(deltas, d => d["kind"]!.GetValue<string>() == "resolved" && d["url"]!.GetValue<string>() == "https://b");
    }

    [Fact]
    public void BuildIssueDeltas_sorts_by_priority_then_kind_then_url()
    {
        var current = Payload("""
            {"categories": [{"name": "seo", "issues": [
                {"url": "https://low", "message": "m1", "priority": "Low"},
                {"url": "https://crit", "message": "m2", "priority": "Critical"}
            ]}]}
            """);
        var baseline = Payload("""{"categories": []}""");

        var deltas = CompareHelpers.BuildIssueDeltas(current, baseline);

        Assert.Equal("https://crit", deltas[0]["url"]!.GetValue<string>());
        Assert.Equal("https://low", deltas[1]["url"]!.GetValue<string>());
    }

    [Fact]
    public void BuildPriorityCounts_counts_each_bucket_and_delta()
    {
        var current = Payload("""{"categories": [{"issues": [{"priority": "High"}, {"priority": "High"}]}]}""");
        var baseline = Payload("""{"categories": [{"issues": [{"priority": "High"}]}]}""");

        var counts = CompareHelpers.BuildPriorityCounts(current, baseline);

        var high = counts.Single(c => c["priority"]!.GetValue<string>() == "High");
        Assert.Equal(2, high["current"]!.GetValue<int>());
        Assert.Equal(1, high["baseline"]!.GetValue<int>());
        Assert.Equal(1, high["delta"]!.GetValue<int>());
    }

    [Fact]
    public void BuildLighthouseUrlDeltas_only_reports_deltas_above_threshold()
    {
        var current = Payload("""{"lighthouse_by_url": {"https://a": {"median_metrics": {"performance_score": 0.9}}}}""");
        var baseline = Payload("""{"lighthouse_by_url": {"https://a": {"median_metrics": {"performance_score": 0.5}}}}""");

        var deltas = CompareHelpers.BuildLighthouseUrlDeltas(current, baseline);

        Assert.Single(deltas);
        Assert.Equal(40, deltas[0]["performance_delta"]!.GetValue<double>());
    }

    [Fact]
    public void BuildLighthouseUrlDeltas_ignores_small_deltas_below_threshold()
    {
        var current = Payload("""{"lighthouse_by_url": {"https://a": {"median_metrics": {"performance_score": 0.91}}}}""");
        var baseline = Payload("""{"lighthouse_by_url": {"https://a": {"median_metrics": {"performance_score": 0.90}}}}""");

        Assert.Empty(CompareHelpers.BuildLighthouseUrlDeltas(current, baseline));
    }

    [Fact]
    public void BuildLinkMetricDeltas_reports_metric_when_delta_exceeds_min()
    {
        var current = Payload("""{"links": [{"url": "https://a", "inlinks": 10}]}""");
        var baseline = Payload("""{"links": [{"url": "https://a", "inlinks": 5}]}""");

        var deltas = CompareHelpers.BuildLinkMetricDeltas(current, baseline);

        Assert.Single(deltas);
        Assert.Equal("inlinks", deltas[0]["metric"]!.GetValue<string>());
        Assert.Equal(5, deltas[0]["delta"]!.GetValue<double>());
    }

    [Fact]
    public void BuildRedirectDeltas_finds_new_and_removed()
    {
        var current = Payload("""{"redirects": [{"url": "https://a", "status": "301"}]}""");
        var baseline = Payload("""{"redirects": [{"url": "https://b", "status": "301"}]}""");

        var deltas = CompareHelpers.BuildRedirectDeltas(current, baseline);

        Assert.Equal(2, deltas.Count);
        Assert.Contains(deltas, d => d["kind"]!.GetValue<string>() == "new");
        Assert.Contains(deltas, d => d["kind"]!.GetValue<string>() == "removed");
    }

    [Fact]
    public void BuildSecurityDeltas_finds_new_and_resolved_findings()
    {
        var current = Payload("""{"security_findings": [{"url": "https://a", "finding_type": "mixed_content", "message": "m"}]}""");
        var baseline = Payload("""{"security_findings": []}""");

        var deltas = CompareHelpers.BuildSecurityDeltas(current, baseline);

        Assert.Single(deltas);
        Assert.Equal("new", deltas[0]["kind"]!.GetValue<string>());
    }

    [Fact]
    public void BuildDuplicateDeltas_detects_new_changed_and_removed_clusters()
    {
        var current = Payload("""{"content_duplicates": [{"id": "c1", "member_count": 3}, {"id": "c2", "member_count": 2}]}""");
        var baseline = Payload("""{"content_duplicates": [{"id": "c2", "member_count": 5}, {"id": "c3", "member_count": 1}]}""");

        var deltas = CompareHelpers.BuildDuplicateDeltas(current, baseline);

        Assert.Contains(deltas, d => d["cluster_id"]!.GetValue<string>() == "c1" && d["kind"]!.GetValue<string>() == "new");
        Assert.Contains(deltas, d => d["cluster_id"]!.GetValue<string>() == "c2" && d["kind"]!.GetValue<string>() == "changed");
        Assert.Contains(deltas, d => d["cluster_id"]!.GetValue<string>() == "c3" && d["kind"]!.GetValue<string>() == "removed");
    }

    [Fact]
    public void BuildTechDeltas_detects_added_and_removed_technologies()
    {
        var current = Payload("""{"tech_stack_summary": {"technologies": [{"name": "React", "count": 5}]}}""");
        var baseline = Payload("""{"tech_stack_summary": {"technologies": [{"name": "jQuery", "count": 2}]}}""");

        var deltas = CompareHelpers.BuildTechDeltas(current, baseline);

        Assert.Contains(deltas, d => d["name"]!.GetValue<string>() == "React" && d["kind"]!.GetValue<string>() == "added");
        Assert.Contains(deltas, d => d["name"]!.GetValue<string>() == "jQuery" && d["kind"]!.GetValue<string>() == "removed");
    }

    [Fact]
    public void BuildContentMetrics_omits_rows_with_no_data_on_either_side()
    {
        var current = Payload("""{"content_analytics": {"word_count_stats": {"mean": 500}}}""");
        var baseline = Payload("""{}""");

        var rows = CompareHelpers.BuildContentMetrics(current, baseline);

        var meanRow = rows.Single(r => r["id"]!.GetValue<string>() == "mean_words");
        Assert.Equal(500, meanRow["current"]!.GetValue<double>());
        Assert.Null(meanRow["baseline"]);
    }

    [Fact]
    public void BuildGoogleMetrics_reports_unavailable_when_no_google_data()
    {
        var result = CompareHelpers.BuildGoogleMetrics(Payload("{}"), Payload("{}"));
        Assert.False(result["available"]!.GetValue<bool>());
    }

    [Fact]
    public void BuildGoogleMetrics_includes_gsc_metrics_when_present()
    {
        var current = Payload("""{"google": {"gsc": {"summary": {"clicks": 100}}}}""");
        var baseline = Payload("""{"google": {"gsc": {"summary": {"clicks": 80}}}}""");

        var result = CompareHelpers.BuildGoogleMetrics(current, baseline);

        Assert.True(result["available"]!.GetValue<bool>());
        var clicks = result["metrics"]!.AsArray().Single(m => m!["id"]!.GetValue<string>() == "gsc_clicks");
        Assert.Equal(20, clicks!["delta"]!.GetValue<double>());
    }

    [Fact]
    public void BuildSeoHealthDeltas_skips_unchanged_fields()
    {
        var current = Payload("""{"seo_health": {"missing_title": 5, "h1_zero": 2}}""");
        var baseline = Payload("""{"seo_health": {"missing_title": 5, "h1_zero": 0}}""");

        var deltas = CompareHelpers.BuildSeoHealthDeltas(current, baseline);

        Assert.Single(deltas);
        Assert.Equal("h1_zero", deltas[0]["id"]!.GetValue<string>());
    }

    [Fact]
    public void BuildCategoryScores_computes_rounded_delta()
    {
        var current = Payload("""{"categories": [{"id": "seo", "name": "SEO", "score": 82}]}""");
        var baseline = Payload("""{"categories": [{"id": "seo", "name": "SEO", "score": 75}]}""");

        var scores = CompareHelpers.BuildCategoryScores(current, baseline);

        Assert.Equal(7, scores[0]["delta"]!.GetValue<double>());
    }

    [Fact]
    public void BuildUrlSetDiff_finds_added_and_removed_urls()
    {
        var current = Payload("""{"links": [{"url": "https://a.com/new"}, {"url": "https://a.com/kept"}]}""");
        var baseline = Payload("""{"links": [{"url": "https://a.com/kept"}, {"url": "https://a.com/gone"}]}""");

        var diff = CompareHelpers.BuildUrlSetDiff(current, baseline);

        Assert.Equal(1, diff["new_count"]!.GetValue<int>());
        Assert.Equal(1, diff["removed_count"]!.GetValue<int>());
    }

    [Fact]
    public void BuildIndexationDeltas_computes_count_and_gap_deltas()
    {
        var current = Payload("""{"indexation_coverage": {"counts": {"indexed": 100}, "lists": {"sitemap_only": ["https://a"]}}}""");
        var baseline = Payload("""{"indexation_coverage": {"counts": {"indexed": 90}, "lists": {"sitemap_only": []}}}""");

        var result = CompareHelpers.BuildIndexationDeltas(current, baseline);

        var indexedDelta = result["count_deltas"]!.AsArray().Single(d => d!["metric"]!.GetValue<string>() == "indexed");
        Assert.Equal(10, indexedDelta!["delta"]!.GetValue<int>());
        Assert.Equal(1, result["gap_deltas"]!["sitemap_only"]!["added_count"]!.GetValue<int>());
    }

    [Fact]
    public void BuildOrphanDeltas_computes_added_removed_and_delta()
    {
        var current = Payload("""{"orphan_urls": ["https://a", "https://b"]}""");
        var baseline = Payload("""{"orphan_urls": ["https://b"]}""");

        var result = CompareHelpers.BuildOrphanDeltas(current, baseline);

        Assert.Equal(2, result["current_count"]!.GetValue<int>());
        Assert.Equal(1, result["baseline_count"]!.GetValue<int>());
        Assert.Equal(1, result["delta"]!.GetValue<int>());
    }

    [Fact]
    public void BuildFullCompare_combines_all_sections()
    {
        var current = Payload("""{"categories": [{"score": 80}]}""");
        var baseline = Payload("""{"categories": [{"score": 70}]}""");

        var result = CompareHelpers.BuildFullCompare(current, baseline, 1, 2);

        Assert.Equal(1L, result["current_report_id"]!.GetValue<long>());
        Assert.Equal(2L, result["baseline_report_id"]!.GetValue<long>());
        Assert.Equal(10, result["health_score"]!["delta"]!.GetValue<int>());
        Assert.NotNull(result["category_scores"]);
        Assert.NotNull(result["issue_deltas"]);
    }
}
