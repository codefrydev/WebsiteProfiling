using System.Text.Json.Nodes;

namespace AiService.Application.Chat;

/// <summary>
/// Builds a user-facing narrative from tool results when LLM synthesis fails.
/// </summary>
public static class ChatNarrativeFallback
{
    private static readonly HashSet<string> WorkflowTools = new(StringComparer.Ordinal)
    {
        "run_insight_workflow",
        "run_technical_workflow",
        "run_keyword_workflow",
        "run_domain_agent",
    };

    public static ChatNarrative? TryFromToolEvents(
        IReadOnlyList<ChatToolEvent> toolEvents,
        string userMessage)
    {
        var insights = new List<string>();
        var actions = new List<string>();

        foreach (var toolEvent in toolEvents)
        {
            if (JsonNode.Parse(toolEvent.ResultJson) is not JsonObject result)
            {
                continue;
            }

            if (WorkflowTools.Contains(toolEvent.Name))
            {
                CollectFromWorkflow(toolEvent.Name, result, insights, actions);
                continue;
            }

            CollectFromResult(toolEvent.Name, result, insights, actions);
        }

        if (insights.Count == 0 && actions.Count == 0 && !string.IsNullOrWhiteSpace(userMessage))
        {
            insights.Add($"Review the tool results for “{Trim(userMessage, 120)}”.");
        }

        if (insights.Count == 0 && actions.Count == 0)
        {
            return null;
        }

        return new ChatNarrative(
            insights.Take(5).ToList(),
            actions.Take(5).ToList());
    }

    private static void CollectFromWorkflow(
        string workflowName,
        JsonObject result,
        List<string> insights,
        List<string> actions)
    {
        if (result["error"]?.GetValue<string>() is { Length: > 0 } error)
        {
            insights.Add($"The {Label(workflowName)} could not finish: {error}");
            actions.Add("Check that a recent audit exists for this property and try again.");
            return;
        }

        var wfType = result["type"]?.GetValue<string>() ?? result["workflow"]?.GetValue<string>() ?? "default";
        if (result["steps"] is JsonArray steps)
        {
            var stepCount = 0;
            foreach (var stepNode in steps)
            {
                if (stepNode is not JsonObject step)
                {
                    continue;
                }

                stepCount++;
                var stepTool = step["tool"]?.GetValue<string>() ?? "tool";
                if (step["result"] is JsonObject stepResult)
                {
                    CollectFromResult(stepTool, stepResult, insights, actions);
                }
            }

            if (stepCount > 0 && insights.Count == 0)
            {
                insights.Add($"Completed {Label(workflowName)} ({wfType}) with {stepCount} data step(s).");
            }
        }
        else
        {
            insights.Add($"Completed {Label(workflowName)} ({wfType}).");
        }
    }

    private static void CollectFromResult(
        string toolName,
        JsonObject result,
        List<string> insights,
        List<string> actions)
    {
        if (result["error"]?.GetValue<string>() is { Length: > 0 } error)
        {
            insights.Add($"{Label(toolName)}: {error}");
            return;
        }

        if (result["summary"]?.GetValue<string>() is { Length: > 0 } summary)
        {
            insights.Add(summary);
        }

        if (result["message"]?.GetValue<string>() is { Length: > 0 } message)
        {
            insights.Add(message);
        }

        if (result["health_score"]?.GetValue<double?>() is { } health)
        {
            insights.Add($"Health score is {health:0}.");
        }

        if (result["site_name"]?.GetValue<string>() is { Length: > 0 } site)
        {
            insights.Add($"Report data loaded for {site}.");
        }

        if (result["total"]?.GetValue<int?>() is { } total && total >= 0)
        {
            insights.Add($"{Label(toolName)} returned {total} item(s).");
        }

        if (result["issues"] is JsonArray issues && issues.Count > 0)
        {
            insights.Add($"Found {issues.Count} issue(s) in {Label(toolName)}.");
            actions.Add("Prioritize critical and high-severity issues first.");
        }

        if (result["items"] is JsonArray items && items.Count > 0 && insights.Count < 5)
        {
            insights.Add($"{Label(toolName)} returned {items.Count} row(s) to review.");
        }

        if (result["recommendation"]?.GetValue<string>() is { Length: > 0 } rec)
        {
            actions.Add(rec);
        }
    }

    private static string Label(string toolName)
        => toolName.Replace("_", " ", StringComparison.Ordinal);

    private static string Trim(string text, int max)
        => text.Length <= max ? text : text[..max].Trim() + "…";
}
