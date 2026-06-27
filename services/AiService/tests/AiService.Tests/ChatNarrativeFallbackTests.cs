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

    [Fact]
    public void TryFromToolEvents_does_not_throw_on_unexpected_field_types()
    {
        // Tool results are arbitrary JSON: a float "total", a numeric "summary", and an
        // object "error" previously threw InvalidOperationException via GetValue<T>().
        var resultJson = """
            {
              "total": 5.0,
              "summary": 42,
              "error": { "code": 500 },
              "issues": [{ "message": "Missing titles" }]
            }
            """;

        var narrative = ChatNarrativeFallback.TryFromToolEvents(
            [new ChatToolEvent("list_issues", "{}", resultJson)],
            "what is broken");

        Assert.NotNull(narrative);
        // Float total is coerced to an int count; mistyped summary/error are skipped, not thrown.
        Assert.Contains(narrative!.PowerInsights, i => i.Contains("returned 5 item(s)"));
        Assert.Contains(narrative.PowerInsights, i => i.Contains("issue(s)"));
    }
}
