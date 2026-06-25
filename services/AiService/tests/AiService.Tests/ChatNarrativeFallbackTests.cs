using AiService.Application.Chat;

namespace AiService.Tests;

public sealed class ChatNarrativeFallbackTests
{
    [Fact]
    public void TryFromToolEvents_builds_narrative_from_workflow_steps()
    {
        var resultJson = """
            {
              "workflow": "insight",
              "type": "priorities",
              "steps": [
                {
                  "tool": "get_opportunity_matrix",
                  "result": { "total": 12, "summary": "Twelve landing pages have striking-distance keywords." }
                },
                {
                  "tool": "get_issue_to_traffic_map",
                  "result": { "total": 4, "issues": [{ "message": "Missing titles" }] }
                }
              ]
            }
            """;

        var narrative = ChatNarrativeFallback.TryFromToolEvents(
            [new ChatToolEvent("run_insight_workflow", "{}", resultJson)],
            "show priorities");

        Assert.NotNull(narrative);
        Assert.NotEmpty(narrative!.PowerInsights);
        Assert.Contains("Twelve landing pages", narrative.PowerInsights[0]);
    }
}
