using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Application.Prompts;
using AiService.Providers.Chat;

namespace AiService.Application.Chat;

public sealed class ChatNarrativeSynthesizer(StructuredCompletionService completionService)
{
    private const string NarrativeFailedMsg = "Could not generate a summary. Tool results are shown below.";

    public string NarrativeFailedMessage => NarrativeFailedMsg;

    public async Task<ChatNarrative> SynthesizeAsync(
        IReadOnlyDictionary<string, string> cfg,
        string userMessage,
        IReadOnlyList<ChatToolEvent> toolEvents,
        Action<string>? onStatus = null,
        Action<string>? onToken = null,
        Action<ChatNarrative>? onPartialNarrative = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await SynthesizeCoreAsync(
                cfg,
                userMessage,
                toolEvents,
                onStatus,
                onToken,
                onPartialNarrative,
                cancellationToken);
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            return ResolveFallbackOrThrow(toolEvents, userMessage, ex);
        }
    }

    private async Task<ChatNarrative> SynthesizeCoreAsync(
        IReadOnlyDictionary<string, string> cfg,
        string userMessage,
        IReadOnlyList<ChatToolEvent> toolEvents,
        Action<string>? onStatus,
        Action<string>? onToken,
        Action<ChatNarrative>? onPartialNarrative,
        CancellationToken cancellationToken)
    {
        var payload = BuildSynthesisPayload(userMessage, toolEvents);
        var extractor = onPartialNarrative is not null ? new StreamingNarrativeExtractor() : null;

        var parsed = await completionService.CompleteJsonStreamingAsync(
            LlmPrompts.ChatNarrativeSystem,
            payload,
            cfg,
            delta =>
            {
                onToken?.Invoke(delta);
                if (extractor is null)
                {
                    return;
                }

                extractor.Append(delta);
                var partial = extractor.TryExtractPartial();
                if (partial is not null)
                {
                    onPartialNarrative!(partial);
                }
            },
            cancellationToken);

        var (narrative, errors) = ChatNarrativeParser.ValidateNarrative(
            ChatNarrativeParser.UnwrapNarrativeObject(parsed));
        if (errors.Count == 0)
        {
            return narrative;
        }

        var repairPayload = JsonSerializer.Serialize(new
        {
            original_data = JsonNode.Parse(payload),
            previous_response = parsed.ToJsonString(),
            errors,
            required_schema = new { power_insights = new[] { "string" }, recommended_actions = new[] { "string" } },
        });

        onStatus?.Invoke("retrying");
        var repaired = await completionService.CompleteJsonAsync(
            LlmPrompts.ChatNarrativeRepairSystem,
            repairPayload,
            cfg,
            cancellationToken);

        var (narrative2, errors2) = ChatNarrativeParser.ValidateNarrative(
            ChatNarrativeParser.UnwrapNarrativeObject(repaired));
        if (errors2.Count == 0)
        {
            return narrative2;
        }

        return ResolveFallbackOrThrow(
            toolEvents,
            userMessage,
            new InvalidOperationException(string.Join("; ", errors.Concat(errors2))));
    }

    private static ChatNarrative ResolveFallbackOrThrow(
        IReadOnlyList<ChatToolEvent> toolEvents,
        string userMessage,
        Exception ex)
    {
        var fallback = ChatNarrativeFallback.TryFromToolEvents(toolEvents, userMessage);
        if (fallback is not null)
        {
            return fallback;
        }

        throw ex;
    }

    private static string BuildSynthesisPayload(string userMessage, IReadOnlyList<ChatToolEvent> toolEvents)
    {
        var compact = toolEvents.Select(ev => new
        {
            name = ev.Name,
            args = JsonNode.Parse(ev.ArgsJson),
            result = JsonNode.Parse(ev.ResultJson),
        });

        var payload = JsonSerializer.Serialize(new
        {
            user_question = userMessage,
            tool_results = compact,
        });

        return payload.Length > 10_000 ? payload[..10_000] + "\n…(truncated)" : payload;
    }
}
