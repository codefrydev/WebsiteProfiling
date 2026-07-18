using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Registry;
using Microsoft.Extensions.AI;

namespace AiService.Application.Chat;

/// <summary>Collects tool invocations and emits typed SSE events for a single chat turn.</summary>
public sealed class ChatTurnProgress(Action<ChatStreamEvent>? emit)
{
    private readonly List<ChatToolEvent> _toolEvents = [];
    private readonly Lock _toolLock = new();

    public IReadOnlyList<ChatToolEvent> ToolEvents => _toolEvents;

    public void EmitStatus(string phase, string detail)
        => emit?.Invoke(new ChatStatusEvent(phase, detail));

    public void EmitToolProgress(string callId, string toolName, string detail)
        => emit?.Invoke(new ChatToolProgressEvent(callId, toolName, detail));

    public void EmitPartialDone(string message)
        => emit?.Invoke(new ChatPartialDoneStreamEvent(message));

    public void EmitNarrative(ChatNarrative narrative)
        => emit?.Invoke(new ChatNarrativeStreamEvent(narrative));

    public void EmitNarrativePartial(ChatNarrative narrative)
        => emit?.Invoke(new ChatNarrativePartialStreamEvent(narrative));

    public void EmitToken(string text)
        => emit?.Invoke(new ChatTokenStreamEvent(text));

    public void EmitDone()
        => emit?.Invoke(new ChatDoneStreamEvent());

    public void EmitError(string message)
        => emit?.Invoke(new ChatErrorStreamEvent(message));

    public string RecordGatedTool(string callId, string toolName, AIFunctionArguments args)
    {
        var argsJson = SerializeArgs(args);
        emit?.Invoke(new ChatToolStartEvent(callId, toolName, argsJson));
        var result = new JsonObject
        {
            ["error"] = $"tool not loaded this turn: {toolName}",
            ["hint"] = "Call search_audit_tools to load specialized tools, or rephrase your request.",
        };
        var fullJson = CompleteTool(callId, toolName, argsJson, result);
        emit?.Invoke(new ChatToolEndEvent(callId, toolName, fullJson, false, fullJson.Length));
        return fullJson;
    }

    public async Task<ToolDispatchOutcome> DispatchToolAsync(
        string callId,
        string toolName,
        AIFunctionArguments args,
        AuditToolContext context,
        ToolDispatcher dispatcher,
        CancellationToken cancellationToken)
    {
        var argsJson = SerializeArgs(args);
        emit?.Invoke(new ChatToolStartEvent(callId, toolName, argsJson));

        JsonObject result;
        try
        {
            if (context.PropertyId is not long propertyId)
            {
                result = new JsonObject { ["error"] = "property_id required" };
            }
            else
            {
                var jsonArgs = ParseArgs(args);
                result = await dispatcher.DispatchAsync(
                    toolName,
                    propertyId,
                    context.ReportId,
                    jsonArgs,
                    cancellationToken);
            }
        }
        catch (Exception ex)
        {
            result = new JsonObject { ["error"] = ex.Message };
        }

        var fullJson = CompleteTool(callId, toolName, argsJson, result);
        var uiObject = ToolResultCompactor.CompactForUi(toolName, result);
        var uiJson = uiObject.ToJsonString();
        var truncated = ToolResultCompactor.WasTruncated(result, uiObject);
        emit?.Invoke(new ChatToolEndEvent(
            callId,
            toolName,
            uiJson,
            truncated,
            result.ToJsonString().Length));

        return new ToolDispatchOutcome(fullJson, uiJson, result);
    }

    private string CompleteTool(string callId, string toolName, string argsJson, JsonObject result)
    {
        var resultJson = result.ToJsonString();
        lock (_toolLock)
        {
            _toolEvents.Add(new ChatToolEvent(toolName, argsJson, resultJson));
        }

        return resultJson;
    }

    private static string SerializeArgs(AIFunctionArguments args)
        => args.Count == 0 ? "{}" : JsonSerializer.Serialize(args.ToDictionary(x => x.Key, x => x.Value));

    private static JsonObject ParseArgs(AIFunctionArguments args)
    {
        if (args.Count == 0)
        {
            return [];
        }

        return JsonNode.Parse(SerializeArgs(args)) as JsonObject ?? [];
    }
}

public sealed record ToolDispatchOutcome(string FullResultJson, string UiResultJson, JsonObject ResultObject);
