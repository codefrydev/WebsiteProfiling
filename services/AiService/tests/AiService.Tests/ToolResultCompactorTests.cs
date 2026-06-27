using System.Text.Json.Nodes;
using AiService.Application.Chat;

namespace AiService.Tests;

public sealed class ToolResultCompactorTests
{
    [Fact]
    public void CompactForLlm_truncates_large_issue_lists()
    {
        var issues = new JsonArray();
        for (var i = 0; i < 500; i++)
        {
            issues.Add(new JsonObject { ["url"] = $"https://example.com/{i}" });
        }

        var full = new JsonObject
        {
            ["issues"] = issues,
            ["total"] = 500,
        };

        var compact = ToolResultCompactor.CompactForLlm("list_issues", full);
        var compactIssues = compact["issues"] as JsonArray;
        Assert.NotNull(compactIssues);
        Assert.True(compactIssues!.Count <= ToolResultCompactor.DefaultLlmListLimit);
        Assert.True(compact["truncated"]?.GetValue<bool>());
    }

    [Fact]
    public void CompactForUi_keeps_export_artifact_fields()
    {
        var full = new JsonObject
        {
            ["artifact_id"] = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            ["format"] = "pdf",
            ["filename"] = "audit.pdf",
            ["ready"] = true,
            ["bytes"] = new JsonArray(Enumerable.Range(0, 1000).Select(i => (JsonNode?)JsonValue.Create(i)).ToArray()),
        };

        var compact = ToolResultCompactor.CompactForUi("export_audit_report", full);
        Assert.Equal("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", compact["artifact_id"]?.GetValue<string>());
        Assert.Null(compact["bytes"]);
    }

    [Fact]
    public void CompactForLlm_summarizes_workflow_steps()
    {
        var full = new JsonObject
        {
            ["workflow"] = "technical",
            ["steps"] = new JsonArray
            {
                new JsonObject
                {
                    ["tool"] = "get_report_summary",
                    ["result"] = new JsonObject { ["health_score"] = 82 },
                },
            },
        };

        var compact = ToolResultCompactor.CompactForLlm("run_technical_workflow", full);
        var steps = compact["steps"] as JsonArray;
        Assert.NotNull(steps);
        Assert.Single(steps!);
    }
}
