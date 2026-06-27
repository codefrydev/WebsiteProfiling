using System.Text.Json;
using ReportService.Application.Build.Categories;

namespace ReportService.Tests;

public sealed class CoreWebVitalsCategoryBuilderTests
{
    [Fact]
    public void Build_applies_crux_deductions_to_lighthouse_score()
    {
        var lh = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """{"median_metrics": {"performance_score": 0.95}, "top_failures": []}""")!;
        var crux = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """{"ok": true, "pass": {"lcp": false, "inp": false, "cls": false}}""")!;

        var category = CoreWebVitalsCategoryBuilder.Build(lh, crux);

        Assert.Equal(50, category.Score);
        Assert.Equal(3, category.Issues.Count(i => i.Message.Contains("CrUX", StringComparison.Ordinal)));
    }

    [Fact]
    public void Build_leaves_score_unchanged_when_crux_passes()
    {
        var lh = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """{"median_metrics": {"performance_score": 0.95}, "top_failures": []}""")!;
        var crux = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """{"ok": true, "pass": {"lcp": true, "inp": true, "cls": true}}""")!;

        var category = CoreWebVitalsCategoryBuilder.Build(lh, crux);

        Assert.Equal(95, category.Score);
    }
}
