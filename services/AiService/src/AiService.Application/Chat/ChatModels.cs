namespace AiService.Application.Chat;

public sealed record ChatMessageRecord(string Role, string Content);

public sealed record ChatNarrative(
    IReadOnlyList<string> PowerInsights,
    IReadOnlyList<string> RecommendedActions);

/// <summary>Immutable tool invocation captured as JSON strings — safe to reuse across SSE and persistence.</summary>
public sealed record ChatToolEvent(string Name, string ArgsJson, string ResultJson);

public sealed record ChatTurnResult(
    bool Ok,
    ChatNarrative? Narrative,
    IReadOnlyList<ChatToolEvent> ToolEvents,
    string? Error);

public abstract record ChatStreamEvent(string Type);

public sealed record ChatStatusEvent(string Phase, string Detail) : ChatStreamEvent("status");

public sealed record ChatToolStartEvent(string CallId, string Name, string ArgsJson) : ChatStreamEvent("tool_start");

public sealed record ChatToolEndEvent(
    string CallId,
    string Name,
    string ResultJson,
    bool Truncated = false,
    int? ResultBytes = null) : ChatStreamEvent("tool_end");

public sealed record ChatToolProgressEvent(string CallId, string Name, string Detail) : ChatStreamEvent("tool_progress");

public sealed record ChatNarrativeStreamEvent(ChatNarrative Narrative) : ChatStreamEvent("narrative");

public sealed record ChatDoneStreamEvent() : ChatStreamEvent("done");

public sealed record ChatErrorStreamEvent(string Message) : ChatStreamEvent("error");

public sealed record ChatPartialDoneStreamEvent(string Message) : ChatStreamEvent("partial_done");
