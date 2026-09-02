using System.Text.Json;
using CoreService.Api.Application.Build;

namespace CoreService.Tests;

public sealed class ReportNativeValidatorCategoryTests
{
    [Fact]
    public void ValidateCategoryIssueCounts_flags_mismatch_except_intelligence()
    {
        var native = new List<ReportCategory>
        {
            new("technical_seo", "Technical SEO", 90, [new("msg", Priority: "High")], []),
            new("intelligence", "Content quality", 100, [], []),
        };

        using var doc = JsonDocument.Parse(
            """
            {
              "categories": [
                {"id": "technical_seo", "issues": [{"message": "a"}, {"message": "b"}]},
                {"id": "intelligence", "issues": [{"message": "dup"}]}
              ]
            }
            """);

        var warnings = ReportNativeValidator.ValidateCategoryIssueCounts(native, doc.RootElement);
        Assert.Single(warnings);
        Assert.Contains("technical_seo", warnings[0], StringComparison.Ordinal);
        Assert.DoesNotContain("intelligence", warnings[0], StringComparison.Ordinal);
    }
}
