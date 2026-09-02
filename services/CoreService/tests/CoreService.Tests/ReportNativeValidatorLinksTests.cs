using System.Text.Json;
using CoreService.Api.Application.Build;

namespace CoreService.Tests;

public sealed class ReportNativeValidatorLinksTests
{
    [Fact]
    public void ValidateLinksCount_flags_bridge_and_crawl_mismatch()
    {
        using var doc = JsonDocument.Parse("""{"links": [{"url": "a"}, {"url": "b"}, {"url": "c"}]}""");
        var warnings = ReportNativeValidator.ValidateLinksCount(2, 3, doc.RootElement);

        Assert.Equal(2, warnings.Count);
        Assert.Contains(warnings, w => w.Contains("native=2, bridge=3", StringComparison.Ordinal));
        Assert.Contains(warnings, w => w.Contains("links vs crawl rows mismatch", StringComparison.Ordinal));
    }
}
