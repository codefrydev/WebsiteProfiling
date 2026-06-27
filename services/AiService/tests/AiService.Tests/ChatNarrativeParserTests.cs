using AiService.Application.Chat;

namespace AiService.Tests;

public sealed class ChatNarrativeParserTests
{
    [Fact]
    public void TryParsePartial_returns_insights_from_incomplete_json()
    {
        var partial = ChatNarrativeParser.TryParsePartial(
            """{"power_insights": ["Fix broken links", "Improve titles"],""");

        Assert.NotNull(partial);
        Assert.Equal(2, partial.PowerInsights.Count);
    }

    [Fact]
    public void ValidateNarrative_normalizes_full_object()
    {
        var raw = System.Text.Json.Nodes.JsonNode.Parse(
            """{"power_insights":["A"],"recommended_actions":["B"]}""") as System.Text.Json.Nodes.JsonObject;
        Assert.NotNull(raw);

        var (narrative, errors) = ChatNarrativeParser.ValidateNarrative(raw);
        Assert.Empty(errors);
        Assert.Equal(["A"], narrative.PowerInsights);
        Assert.Equal(["B"], narrative.RecommendedActions);
    }
}
