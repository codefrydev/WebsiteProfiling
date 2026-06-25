using System.Text.Json.Nodes;

namespace AiService.Application.Chat;

/// <summary>Maps typed chat events to wire-format JSON at the HTTP boundary only.</summary>
public static class ChatSseSerializer
{
    public static JsonObject ToJson(ChatStreamEvent evt) => evt switch
    {
        ChatStatusEvent s => new()
        {
            ["type"] = s.Type,
            ["phase"] = s.Phase,
            ["detail"] = s.Detail,
        },
        ChatToolStartEvent t => new()
        {
            ["type"] = t.Type,
            ["call_id"] = t.CallId,
            ["name"] = t.Name,
            ["args"] = ParseJsonObject(t.ArgsJson),
        },
        ChatToolEndEvent t => new()
        {
            ["type"] = t.Type,
            ["call_id"] = t.CallId,
            ["name"] = t.Name,
            ["result"] = ParseJsonObject(t.ResultJson),
            ["truncated"] = t.Truncated,
            ["result_bytes"] = t.ResultBytes,
        },
        ChatToolProgressEvent p => new()
        {
            ["type"] = p.Type,
            ["call_id"] = p.CallId,
            ["name"] = p.Name,
            ["detail"] = p.Detail,
        },
        ChatNarrativeStreamEvent n => new()
        {
            ["type"] = n.Type,
            ["narrative"] = ToNarrativeJson(n.Narrative),
        },
        ChatDoneStreamEvent d => new() { ["type"] = d.Type },
        ChatErrorStreamEvent e => new() { ["type"] = e.Type, ["message"] = e.Message },
        ChatPartialDoneStreamEvent p => new() { ["type"] = p.Type, ["message"] = p.Message },
        _ => new JsonObject { ["type"] = evt.Type },
    };

    private static JsonObject ToNarrativeJson(ChatNarrative narrative)
        => new()
        {
            ["power_insights"] = new JsonArray(narrative.PowerInsights.Select(x => JsonValue.Create(x)).ToArray()),
            ["recommended_actions"] = new JsonArray(narrative.RecommendedActions.Select(x => JsonValue.Create(x)).ToArray()),
        };

    private static JsonNode ParseJsonObject(string json)
        => JsonNode.Parse(json) ?? new JsonObject();
}
