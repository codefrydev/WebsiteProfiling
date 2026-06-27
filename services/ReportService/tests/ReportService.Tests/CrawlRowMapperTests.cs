using ReportService.Application.Build;
using ReportService.Application.Repositories;
using ReportService.Domain.Entities;

namespace ReportService.Tests;

public sealed class CrawlRowMapperTests
{
    [Fact]
    public void MergeRow_reads_numeric_status_from_json()
    {
        var row = CrawlRowMapper.MergeRow(
            "https://example.com/",
            "static",
            """{"status":200,"title":"Home","response_time_ms":120}""");

        Assert.Equal("200", row.Status);
        Assert.Equal("Home", row.Title);
        Assert.Equal(120, row.ResponseTimeMs);
    }

    [Fact]
    public void FromEntity_falls_back_to_status_column_when_json_missing()
    {
        var entity = new CrawlResult
        {
            Url = "https://example.com/page",
            FetchMethod = "static",
            Status = "404",
            Data = """{"title":"Missing"}""",
        };

        var row = CrawlRowMapper.FromEntity(entity);
        Assert.Equal("404", row.Status);
    }

    [Fact]
    public void FromEntity_prefers_json_status_over_column()
    {
        var entity = new CrawlResult
        {
            Url = "https://example.com/page",
            FetchMethod = "static",
            Status = "404",
            Data = """{"status":301,"title":"Redirect"}""",
        };

        var row = CrawlRowMapper.FromEntity(entity);
        Assert.Equal("301", row.Status);
    }

    [Fact]
    public void BuildLinksList_includes_status_from_numeric_json()
    {
        var row = CrawlRowMapper.MergeRow(
            "https://example.com/",
            "static",
            """{"status":200,"title":"Home"}""");
        var links = LinksListBuilder.BuildLinksList([row], new Dictionary<string, int>(), null, null);

        Assert.Single(links);
        Assert.Equal("200", links[0]["status"]);
    }
}
