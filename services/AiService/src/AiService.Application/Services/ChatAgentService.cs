using AiService.Application.Chat;
using AiService.Domain.Models;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;
using AiService.Tools.Context;
using AiService.Tools.Selection;
using Microsoft.Extensions.AI;

namespace AiService.Application.Services;

/// <summary>
/// Chat agent turn orchestration — ports Python <c>run_agent_turn</c> using a manual tool loop.
/// </summary>
public sealed class ChatAgentService(
    ILlmSettingsRepository configRepository,
    IChatClientFactory chatClientFactory,
    ChatAgentLoop agentLoop,
    ChatNarrativeSynthesizer narrativeSynthesizer,
    AuditToolSelectionService toolSelection)
{
    public async Task<ChatTurnResult> RunTurnAsync(
        IReadOnlyList<ChatMessageRecord> history,
        AuditToolContext context,
        Action<ChatStreamEvent>? onEvent = null,
        CancellationToken cancellationToken = default)
    {
        var progress = new ChatTurnProgress(onEvent);
        var settings = await configRepository.LoadAsync(cancellationToken);
        if (!LlmConfigHelpers.IsEnabled(settings))
        {
            const string err = "AI is disabled. Enable AI insights in the AI settings tab and configure a provider.";
            progress.EmitError(err);
            return new ChatTurnResult(false, null, progress.ToolEvents, err);
        }

        IChatClient client;
        try
        {
            client = chatClientFactory.CreateClient(settings);
        }
        catch (Exception ex)
        {
            progress.EmitError(ex.Message);
            return new ChatTurnResult(false, null, progress.ToolEvents, ex.Message);
        }

        var systemPrompt = ChatAgentConfig.ResolveSystemPrompt(settings);
        var messages = BuildMessages(history, systemPrompt);
        var lastUser = LastUserMessage(history);
        var maxRounds = ChatAgentConfig.ResolveMaxToolRounds(settings);

        var enabledTools = (await toolSelection.GetEnabledToolNamesAsync(cancellationToken))
            .ToHashSet(StringComparer.Ordinal);
        if (ChatAgentConfig.ChatAllowCrawl(settings))
        {
            enabledTools.Add(ChatAgentConfig.ChatCrawlTool);
        }

        var priorUserMessages = history
            .Where(m => m.Role == "user")
            .Select(m => m.Content)
            .ToList();

        HashSet<string>? extraTools = ChatAgentConfig.ChatAllowCrawl(settings)
            ? [ChatAgentConfig.ChatCrawlTool]
            : null;

        var activeTools = ChatToolSelector.SelectToolsForTurn(
            lastUser,
            priorUserMessages,
            enabledTools,
            extraNames: extraTools);

        ChatAgentLoopResult loopResult;
        using (client)
        {
            try
            {
                loopResult = await agentLoop.RunAsync(
                    client,
                    messages,
                    activeTools,
                    enabledTools,
                    settings,
                    context,
                    progress,
                    maxRounds,
                    cancellationToken);
            }
            catch (Exception ex)
            {
                var msg = ChatAgentConfig.MapAgentError(ex, settings);
                progress.EmitError(msg);
                return new ChatTurnResult(false, null, progress.ToolEvents, msg);
            }
        }

        return await FinishWithNarrativeAsync(settings, lastUser, progress, loopResult.PartialNote, cancellationToken);
    }

    private async Task<ChatTurnResult> FinishWithNarrativeAsync(
        LlmSettings settings,
        string userMessage,
        ChatTurnProgress progress,
        string? partialNote,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(partialNote))
        {
            progress.EmitPartialDone(partialNote);
        }

        progress.EmitStatus("synthesizing", "Summarizing insights…");

        try
        {
            var narrative = await narrativeSynthesizer.SynthesizeAsync(
                settings,
                userMessage,
                progress.ToolEvents,
                phase =>
                {
                    var detail = phase == "retrying" ? "Retrying summary…" : "Summarizing insights…";
                    progress.EmitStatus("synthesizing", detail);
                },
                onToken: progress.EmitToken,
                onPartialNarrative: progress.EmitNarrativePartial,
                cancellationToken);
            progress.EmitNarrative(narrative);
            progress.EmitDone();
            return new ChatTurnResult(true, narrative, progress.ToolEvents, null);
        }
        catch (Exception ex)
        {
            progress.EmitError(narrativeSynthesizer.NarrativeFailedMessage);
            return new ChatTurnResult(false, null, progress.ToolEvents, ex.Message);
        }
    }

    private static List<ChatMessage> BuildMessages(IReadOnlyList<ChatMessageRecord> history, string systemPrompt)
    {
        var messages = new List<ChatMessage> { new(ChatRole.System, systemPrompt) };
        foreach (var msg in history)
        {
            if (msg.Role is "user" or "assistant")
            {
                var content = ChatTextSanitize.StripSurrogates(msg.Content);
                messages.Add(new ChatMessage(msg.Role == "user" ? ChatRole.User : ChatRole.Assistant, content));
            }
        }

        return messages;
    }

    private static string LastUserMessage(IReadOnlyList<ChatMessageRecord> history)
    {
        for (var i = history.Count - 1; i >= 0; i--)
        {
            if (history[i].Role == "user")
            {
                return ChatTextSanitize.StripSurrogates(history[i].Content);
            }
        }

        return "";
    }
}
