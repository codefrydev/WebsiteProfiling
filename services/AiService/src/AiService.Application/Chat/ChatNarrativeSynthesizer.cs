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
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await SynthesizeCoreAsync(cfg, userMessage, toolEvents, onStatus, cancellationToken);
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
        CancellationToken cancellationToken)
    {
        var payload = BuildSynthesisPayload(userMessage, toolEvents);
        var parsed = await completionService.CompleteJsonAsync(
            LlmPrompts.ChatNarrativeSystem,
            payload,
            cfg,
            cancellationToken);

        var (narrative, errors) = ValidateNarrative(UnwrapNarrativeObject(parsed));
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

        var (narrative2, errors2) = ValidateNarrative(UnwrapNarrativeObject(repaired));
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

    private static JsonObject UnwrapNarrativeObject(JsonObject parsed)
    {
        if (parsed["power_insights"] is JsonArray || parsed["recommended_actions"] is JsonArray)
        {
            return parsed;
        }

        if (parsed["data"] is JsonObject data)
        {
            return data;
        }

        return parsed;
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

    private static (ChatNarrative Narrative, List<string> Errors) ValidateNarrative(JsonObject raw)
    {
        var errors = new List<string>();
        var insights = NormalizeStringList(raw["power_insights"], "power_insights", errors);
        var actions = NormalizeStringList(raw["recommended_actions"], "recommended_actions", errors);
        if (insights.Count == 0 && actions.Count == 0)
        {
            errors.Add("both power_insights and recommended_actions are empty after normalization");
        }

        return (new ChatNarrative(insights, actions), errors);
    }

    private static List<string> NormalizeStringList(JsonNode? value, string field, List<string> errors)
    {
        var outList = new List<string>();
        if (value is not JsonArray list)
        {
            errors.Add($"missing key {field}");
            return outList;
        }

        foreach (var item in list)
        {
            var text = (item?.GetValue<string>() ?? "").Trim();
            if (string.IsNullOrEmpty(text))
            {
                continue;
            }

            outList.Add(text);
            if (outList.Count >= 5)
            {
                break;
            }
        }

        return outList;
    }
}
