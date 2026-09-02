using System.Text.Json;
using CoreService.Api.DataApplication.Content;

namespace CoreService.Tests;

public sealed class ContentBriefBuilderTests
{
    [Fact]
    public void Build_uses_cluster_rows_and_gsc_clicks()
    {
        var rows = JsonSerializer.Deserialize<JsonElement>(
            """
            [
              {"keyword":"chain reaction game","gsc_clicks":12},
              {"keyword":"chain reaction","gsc_clicks":3}
            ]
            """);

        var brief = ContentBriefBuilder.Build(
            "chain reaction game",
            [rows[0], rows[1]],
            ["missing FAQ"]);

        Assert.Equal("chain reaction game", brief["keyword"]);
        Assert.Equal("Estimated", brief["provenance"]);
        var summary = Assert.IsType<List<string>>(brief["summary"]);
        Assert.Contains("Gap: missing FAQ", summary);
        Assert.Contains("Target cluster around 'chain reaction game' (12 clicks)", summary);
    }
}
