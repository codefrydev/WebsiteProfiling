using ReportService.Application.Build;
using ReportService.Application.Build.Categories;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class SecurityCategoryBuilderTests
{
    [Fact]
    public void Build_headers_mixed_content_findings()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/",
                Status = "200",
                FinalUrl = "https://example.com/",
                StrictTransportSecurity = "",
                XContentTypeOptions = "",
                XFrameOptions = "",
                MixedContentCount = 2,
            },
        };

        var findings = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["severity"] = "Critical",
                ["finding_type"] = "sql_injection",
                ["message"] = "SQL injection risk",
                ["url"] = "https://example.com/login",
                ["recommendation"] = "Sanitize inputs",
            },
            new()
            {
                ["severity"] = "Unknown",
                ["message"] = "Minor issue",
                ["url"] = "",
                ["recommendation"] = "",
            },
        };

        var cat = SecurityCategoryBuilder.Build(rows, "https://example.com/", findings);
        var msgs = string.Join(" ", cat.Issues.Select(i => i.Message)).ToLowerInvariant();
        Assert.Contains("strict-transport-security", msgs);
        Assert.Contains("x-content-type-options", msgs);
        Assert.Contains("x-frame-options", msgs);
        Assert.Contains("mixed content", msgs);
        Assert.Contains("sql injection", msgs);

        var scannerIssue = cat.Issues.Single(i => i.Message.Contains("SQL injection", StringComparison.OrdinalIgnoreCase));
        Assert.Equal("sql_injection", scannerIssue.FindingType);

        var payload = CategoryPayloadSerializer.ToPayload([cat]).Single();
        var issueDict = Assert.IsType<List<Dictionary<string, object?>>>(payload["issues"]).Single(i =>
            (i["message"]?.ToString() ?? "").Contains("SQL injection", StringComparison.OrdinalIgnoreCase));
        Assert.Equal("sql_injection", issueDict["finding_type"]);
    }
}
