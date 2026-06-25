using System.Text.Json.Nodes;

namespace AiService.Application.Chat;

/// <summary>Maps a completed chat turn to the JSON stored in <c>chat_messages.tool_result</c>.</summary>
public static class ChatPersistenceMapper
{
    public static string? ToToolResultJson(ChatTurnResult result)
    {
        if (!result.Ok && result.Narrative is null && result.ToolEvents.Count == 0)
        {
            return null;
        }

        var payload = new JsonObject();
        if (result.Narrative is { } narrative)
        {
            payload["narrative"] = new JsonObject
            {
                ["power_insights"] = new JsonArray(narrative.PowerInsights.Select(x => JsonValue.Create(x)).ToArray<JsonNode?>()),
                ["recommended_actions"] = new JsonArray(narrative.RecommendedActions.Select(x => JsonValue.Create(x)).ToArray<JsonNode?>()),
            };
        }

        if (result.ToolEvents.Count > 0)
        {
            payload["tool_events"] = new JsonArray(result.ToolEvents.Select(ToPersistedToolEvent).ToArray());
        }

        if (!string.IsNullOrWhiteSpace(result.Error))
        {
            payload["agent_error"] = result.Error;
        }

        return payload.Count == 0 ? null : payload.ToJsonString();
    }

    public static string FirstNarrativeInsight(ChatTurnResult result)
    {
        if (result.Narrative is not { } narrative)
        {
            return "";
        }

        if (narrative.PowerInsights.Count > 0)
        {
            return narrative.PowerInsights[0];
        }

        return narrative.RecommendedActions.Count > 0 ? narrative.RecommendedActions[0] : "";
    }

    private static JsonObject ToPersistedToolEvent(ChatToolEvent toolEvent)
        => new()
        {
            ["name"] = toolEvent.Name,
            ["args"] = JsonNode.Parse(toolEvent.ArgsJson) ?? new JsonObject(),
            ["result"] = JsonNode.Parse(toolEvent.ResultJson) ?? new JsonObject(),
        };
}
