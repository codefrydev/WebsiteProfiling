using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Registry;
using AiService.Tools.Selection;
using Microsoft.Extensions.AI;

namespace AiService.Application.Chat;

/// <summary>
/// Manual multi-round tool loop (ports Python <c>run_agent_turn</c> inner loop) with parallel
/// tool dispatch and mid-turn tool expansion after search/domain-agent results.
/// </summary>
public sealed class ChatAgentLoop(AuditChatToolsBuilder toolsBuilder, ToolDispatcher toolDispatcher)
{
    public async Task<ChatAgentLoopResult> RunAsync(
        IChatClient client,
        List<ChatMessage> messages,
        HashSet<string> activeTools,
        IReadOnlySet<string> allowedTools,
        IReadOnlyDictionary<string, string> cfg,
        AuditToolContext context,
        ChatTurnProgress progress,
        int maxRounds,
        CancellationToken cancellationToken)
    {
        var gated = ChatToolSelector.ResolveChatToolMode(cfg) != "full";
        var sessionTools = new HashSet<string>(activeTools, StringComparer.Ordinal);
        var finished = false;

        for (var round = 0; round < maxRounds; round++)
        {
            progress.EmitStatus("model", $"Planning step {round + 1} of {maxRounds}…");
            var chatOptions = BuildChatOptions(context, sessionTools, progress);
            var response = await client.GetResponseAsync(messages, chatOptions, cancellationToken);
            var assistantMessage = response.Messages.LastOrDefault(m => m.Role == ChatRole.Assistant);
            var toolCalls = assistantMessage?.Contents.OfType<FunctionCallContent>().ToList() ?? [];
            if (toolCalls.Count == 0)
            {
                finished = true;
                break;
            }

            foreach (var call in toolCalls)
            {
                sessionTools.Add(call.Name);
            }

            messages.Add(assistantMessage!);
            var preRoundActive = activeTools.ToHashSet(StringComparer.Ordinal);
            var batchStart = progress.ToolEvents.Count;
            var dispatchResults = await DispatchToolBatchAsync(
                toolCalls,
                preRoundActive,
                gated,
                context,
                progress,
                cancellationToken);

            foreach (var result in dispatchResults)
            {
                sessionTools.Add(result.Name);
                activeTools = ChatToolSelector.ExpandActiveToolsFromResult(
                    result.Name,
                    result.ResultObject,
                    activeTools,
                    allowedTools,
                    cfg);
                sessionTools.UnionWith(activeTools);

                messages.Add(new ChatMessage(
                    ChatRole.Tool,
                    [new FunctionResultContent(result.CallId, result.LlmResultJson)]));
            }

            var batchEvents = progress.ToolEvents.Skip(batchStart).ToList();
            if (ChatAgentConfig.ShouldFastFinishAfterBatch(batchEvents, cfg))
            {
                finished = true;
                break;
            }
        }

        string? partialNote = null;
        if (!finished && progress.ToolEvents.Count > 0)
        {
            partialNote =
                $"The agent completed {progress.ToolEvents.Count} tool step(s) but did not finish " +
                "all planned steps. Tool results are preserved below.";
        }

        return new ChatAgentLoopResult(finished, partialNote);
    }

    private ChatOptions BuildChatOptions(
        AuditToolContext context,
        IReadOnlySet<string> activeTools,
        ChatTurnProgress progress)
        => new()
        {
            Tools = toolsBuilder.Build(context, activeTools, progress).Cast<AITool>().ToList(),
        };

    private async Task<List<ToolDispatchResult>> DispatchToolBatchAsync(
        IReadOnlyList<FunctionCallContent> toolCalls,
        HashSet<string> preRoundActive,
        bool gated,
        AuditToolContext context,
        ChatTurnProgress progress,
        CancellationToken cancellationToken)
    {
        var factories = toolCalls.Select(call => (Func<Task<ToolDispatchResult>>)(() =>
            DispatchOneToolAsync(call, preRoundActive, gated, context, progress, cancellationToken))).ToList();

        return (await ToolConcurrency.MapParallelAsync(
            factories,
            ToolConcurrency.ResolveMaxWorkers(),
            cancellationToken)).ToList();
    }

    private async Task<ToolDispatchResult> DispatchOneToolAsync(
        FunctionCallContent call,
        HashSet<string> preRoundActive,
        bool gated,
        AuditToolContext context,
        ChatTurnProgress progress,
        CancellationToken cancellationToken)
    {
        var callId = string.IsNullOrWhiteSpace(call.CallId) ? Guid.NewGuid().ToString("N") : call.CallId;
        var args = new AIFunctionArguments(call.Arguments ?? new Dictionary<string, object?>());
        ToolDispatchOutcome outcome;

        if (gated && !preRoundActive.Contains(call.Name))
        {
            var gatedJson = progress.RecordGatedTool(callId, call.Name, args);
            var gatedObject = JsonNode.Parse(gatedJson) as JsonObject ?? [];
            outcome = new ToolDispatchOutcome(gatedJson, gatedJson, gatedObject);
        }
        else
        {
            EmitWorkflowProgress(callId, call.Name, progress);
            outcome = await progress.DispatchToolAsync(
                callId,
                call.Name,
                args,
                context,
                toolDispatcher,
                cancellationToken);
        }

        var llmObject = ToolResultCompactor.CompactForLlm(call.Name, outcome.ResultObject);
        return new ToolDispatchResult(
            callId,
            call.Name,
            outcome.FullResultJson,
            llmObject.ToJsonString(),
            outcome.ResultObject);
    }

    private static void EmitWorkflowProgress(string callId, string toolName, ChatTurnProgress progress)
    {
        if (toolName is "run_insight_workflow" or "run_technical_workflow" or "run_keyword_workflow")
        {
            progress.EmitToolProgress(callId, toolName, "Running workflow steps…");
        }
        else if (toolName == "run_domain_agent")
        {
            progress.EmitToolProgress(callId, toolName, "Exploring domain tools…");
        }
    }

    private sealed record ToolDispatchResult(
        string CallId,
        string Name,
        string FullResultJson,
        string LlmResultJson,
        JsonObject ResultObject);
}

public sealed record ChatAgentLoopResult(bool Finished, string? PartialNote);
