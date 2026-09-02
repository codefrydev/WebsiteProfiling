using AiService.Api.Application.Chat;

namespace AiService.Tests;

public sealed class ChatPersistenceMapperTests
{
    [Fact]
    public void ToToolResultJson_ProducesFrontendCompatibleShape()
    {
        var result = new ChatTurnResult(
            Ok: true,
            Narrative: new ChatNarrative(["insight one"], ["action one"]),
            ToolEvents: [new ChatToolEvent("search", """{"q":"gi"}""", """{"items":[]}""")],
            Error: null);

        var json = ChatPersistenceMapper.ToToolResultJson(result);
        Assert.NotNull(json);
        Assert.Contains("power_insights", json);
        Assert.Contains("tool_events", json);
        Assert.Contains("insight one", json);
    }

    [Fact]
    public void ToToolResultJson_IncludesAgentErrorOnPartialFailure()
    {
        var result = new ChatTurnResult(
            Ok: false,
            Narrative: null,
            ToolEvents: [new ChatToolEvent("search", "{}", """{"error":"x"}""")],
            Error: "narrative failed");

        var json = ChatPersistenceMapper.ToToolResultJson(result);
        Assert.NotNull(json);
        Assert.Contains("agent_error", json);
    }

    [Fact]
    public void FirstNarrativeInsight_PrefersPowerInsights()
    {
        var result = new ChatTurnResult(
            Ok: true,
            Narrative: new ChatNarrative(["first insight"], ["first action"]),
            ToolEvents: [],
            Error: null);

        Assert.Equal("first insight", ChatPersistenceMapper.FirstNarrativeInsight(result));
    }
}
