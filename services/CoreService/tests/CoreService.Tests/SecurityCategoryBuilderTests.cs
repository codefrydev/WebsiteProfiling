using CoreService.Api.Application.Build;
using CoreService.Api.Application.Build.Categories;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

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

        var passiveFindings = SecurityScanBuilder.BuildPassive(rows, "https://example.com/");
        var findings = passiveFindings.Concat(new List<Dictionary<string, object?>>
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
        }).ToList();

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

    [Fact]
    public void Build_passive_header_findings_not_double_counted()
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
                ContentSecurityPolicy = "",
            },
        };

        var findings = SecurityScanBuilder.BuildPassive(rows, "https://example.com/");
        var cat = SecurityCategoryBuilder.Build(rows, "https://example.com/", findings);

        Assert.Equal(75, cat.Score);
        Assert.Equal(4, cat.Issues.Count);
    }
}
