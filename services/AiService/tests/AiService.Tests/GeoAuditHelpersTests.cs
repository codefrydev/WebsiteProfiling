using System.Text.Json.Nodes;
using AiService.Api.Tools.Handlers.Geo;
using AiService.Api.Tools.Slice;

namespace AiService.Tests;

public sealed class GeoAuditHelpersTests
{
    [Fact]
    public void HasFaqSchema_detects_faqpage_type()
    {
        var row = JsonNode.Parse("""{"page_analysis":{"json_ld_types":["FAQPage"]}}""") as JsonObject;
        Assert.NotNull(row);
        Assert.True(GeoAuditHelpers.HasFaqSchema(row));
    }

    [Fact]
    public void ParseRobotsAccess_blocks_disallow_root()
    {
        const string robots = """
            User-agent: GPTBot
            Disallow: /
            """;
        var access = GeoAuditHelpers.ParseRobotsAccess(robots);
        Assert.Equal("blocked", access["gptbot"]);
    }

    [Fact]
    public void CrawlSliceHelpers_IsSuccess2xx_handles_numeric_status()
    {
        var row = JsonNode.Parse("""{"status":200}""") as JsonObject;
        Assert.NotNull(row);
        Assert.True(CrawlSliceHelpers.IsSuccess2xx(row));
    }

    [Fact]
    public void ScoreBand_maps_thresholds()
    {
        Assert.Equal("Excellent", GeoAuditHelpers.ScoreBand(90));
        Assert.Equal("Critical", GeoAuditHelpers.ScoreBand(10));
    }
}
