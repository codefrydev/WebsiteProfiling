using System.Text.Json.Nodes;
using AiService.Tools.Slice;

namespace AiService.Tests;

/// <summary>Parity tests for the native crawl filter port (mirrors Python _slice.crawl_filter).</summary>
public sealed class CrawlFilterTests
{
    // ─── RowHasSchema ───────────────────────────────────────────────────────────

    [Fact]
    public void RowHasSchema_true_for_json_bool_true()
        => Assert.True(CrawlFilter.RowHasSchema(Row("""{"has_schema": true}""")));

    [Fact]
    public void RowHasSchema_false_for_json_bool_false()
        => Assert.False(CrawlFilter.RowHasSchema(Row("""{"has_schema": false}""")));

    [Fact]
    public void RowHasSchema_true_for_string_true()
        => Assert.True(CrawlFilter.RowHasSchema(Row("""{"has_schema": "true"}""")));

    [Fact]
    public void RowHasSchema_true_for_string_1()
        => Assert.True(CrawlFilter.RowHasSchema(Row("""{"has_schema": "1"}""")));

    [Fact]
    public void RowHasSchema_false_for_missing_key()
        => Assert.False(CrawlFilter.RowHasSchema(Row("{}")));

    // ─── RowSchemaTypesList ─────────────────────────────────────────────────────

    [Fact]
    public void RowSchemaTypesList_from_json_ld_types_array()
    {
        var row = Row("""{"page_analysis": {"json_ld_types": ["Product", "BreadcrumbList"]}}""");
        var types = CrawlFilter.RowSchemaTypesList(row);
        Assert.Equal(new[] { "Product", "BreadcrumbList" }, types);
    }

    [Fact]
    public void RowSchemaTypesList_falls_back_to_schema_types()
    {
        var row = Row("""{"page_analysis": {"schema_types": ["Article"]}}""");
        var types = CrawlFilter.RowSchemaTypesList(row);
        Assert.Equal(new[] { "Article" }, types);
    }

    [Fact]
    public void RowSchemaTypesList_empty_when_no_page_analysis()
        => Assert.Empty(CrawlFilter.RowSchemaTypesList(Row("{}")));

    [Fact]
    public void RowSchemaTypesList_handles_double_encoded_page_analysis()
    {
        // page_analysis stored as a JSON string inside the data blob.
        var encoded = System.Text.Json.JsonSerializer.Serialize(
            new { json_ld_types = new[] { "FAQPage" } });
        var row = Row($$"""{"page_analysis": {{System.Text.Json.JsonSerializer.Serialize(encoded)}}}""");
        var types = CrawlFilter.RowSchemaTypesList(row);
        Assert.Equal(new[] { "FAQPage" }, types);
    }

    // ─── Filter — basic ─────────────────────────────────────────────────────────

    [Fact]
    public void Filter_empty_returns_empty_result()
    {
        var result = CrawlFilter.Filter(null);
        Assert.Equal(0, result["total"]!.GetValue<int>());
    }

    [Fact]
    public void Filter_no_predicates_returns_all()
    {
        var rows = MakeRows(5);
        var result = CrawlFilter.Filter(rows, limit: 10);
        Assert.Equal(5, result["total"]!.GetValue<int>());
        Assert.False(result["truncated"]!.GetValue<bool>());
        Assert.Equal(5, ((JsonArray)result["pages"]!).Count);
    }

    [Fact]
    public void Filter_status_filters_by_exact_match()
    {
        var rows = new[]
        {
            Row("""{"url": "https://x.com/a", "status": "200"}"""),
            Row("""{"url": "https://x.com/b", "status": "404"}"""),
            Row("""{"url": "https://x.com/c", "status": "200"}"""),
        };

        var result = CrawlFilter.Filter(rows, status: "404");
        Assert.Equal(1, result["total"]!.GetValue<int>());
        var page = (JsonObject)((JsonArray)result["pages"]!)[0]!;
        Assert.Equal("https://x.com/b", page["url"]!.GetValue<string>());
    }

    [Fact]
    public void Filter_url_contains_case_insensitive()
    {
        var rows = new[]
        {
            Row("""{"url": "https://x.com/Blog/Post", "status": "200"}"""),
            Row("""{"url": "https://x.com/about", "status": "200"}"""),
        };

        var result = CrawlFilter.Filter(rows, urlContains: "blog");
        Assert.Equal(1, result["total"]!.GetValue<int>());
    }

    [Fact]
    public void Filter_has_schema_true_keeps_only_schema_rows()
    {
        var rows = new[]
        {
            Row("""{"url": "https://x.com/a", "has_schema": true, "status": "200"}"""),
            Row("""{"url": "https://x.com/b", "has_schema": false, "status": "200"}"""),
        };

        var result = CrawlFilter.Filter(rows, hasSchema: true);
        Assert.Equal(1, result["total"]!.GetValue<int>());
        var page = (JsonObject)((JsonArray)result["pages"]!)[0]!;
        Assert.Equal("https://x.com/a", page["url"]!.GetValue<string>());
    }

    [Fact]
    public void Filter_schema_type_matches_substring()
    {
        var rows = new[]
        {
            Row("""{"url": "https://x.com/a", "status": "200", "page_analysis": {"json_ld_types": ["Product"]}}"""),
            Row("""{"url": "https://x.com/b", "status": "200", "page_analysis": {"json_ld_types": ["Article"]}}"""),
        };

        var result = CrawlFilter.Filter(rows, schemaType: "product");
        Assert.Equal(1, result["total"]!.GetValue<int>());
    }

    [Fact]
    public void Filter_truncates_at_limit()
    {
        var rows = MakeRows(10);
        var result = CrawlFilter.Filter(rows, limit: 3, maxCap: 3);
        Assert.Equal(10, result["total"]!.GetValue<int>());
        Assert.True(result["truncated"]!.GetValue<bool>());
        Assert.Equal(3, ((JsonArray)result["pages"]!).Count);
    }

    [Fact]
    public void Filter_pages_contain_expected_fields()
    {
        var rows = new[]
        {
            Row("""{"url":"https://x.com/p","status":"200","title":"Page","has_schema":true,"page_analysis":{"json_ld_types":["Article"]}}"""),
        };

        var result = CrawlFilter.Filter(rows);
        var page = (JsonObject)((JsonArray)result["pages"]!)[0]!;
        Assert.Equal("https://x.com/p", page["url"]!.GetValue<string>());
        Assert.Equal("200", page["status"]!.GetValue<string>());
        Assert.Equal("Page", page["title"]!.GetValue<string>());
        Assert.True(page["has_schema"]!.GetValue<bool>());
        var schemaArr = (JsonArray)page["schema_types"]!;
        Assert.Equal("Article", schemaArr[0]!.GetValue<string>());
    }

    // ─── helpers ────────────────────────────────────────────────────────────────

    private static JsonObject Row(string json)
        => (JsonObject)JsonNode.Parse(json)!;

    private static IReadOnlyList<JsonObject> MakeRows(int n)
        => Enumerable.Range(0, n)
            .Select(i => Row($$"""{"url":"https://x.com/page{{i}}","status":"200","title":"Page {{i}}"}"""))
            .ToList();
}
