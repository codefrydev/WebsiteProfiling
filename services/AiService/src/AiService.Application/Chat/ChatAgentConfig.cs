using AiService.Application.Prompts;
using AiService.Domain.Models;
using AiService.Providers.Chat;

namespace AiService.Application.Chat;

/// <summary>Chat agent constants and config resolution ported from Python <c>llm/agent.py</c>.</summary>
public static class ChatAgentConfig
{
    public const int MaxToolRoundsDefault = 10;
    public const int MaxToolRoundsExtended = 100;
    public const string ChatCrawlTool = "prepare_audit_run";
    public const string NarrativeFailedMessage = "Could not generate a summary. Tool results are shown below.";

    public static int ResolveMaxToolRounds(LlmSettings settings)
    {
        if (settings.ChatUnlimitedToolRounds)
        {
            var extendedRaw = Environment.GetEnvironmentVariable("CHAT_MAX_TOOL_ROUNDS_EXTENDED")?.Trim();
            if (int.TryParse(extendedRaw, out var extended) && extended > 0)
            {
                return extended;
            }

            return MaxToolRoundsExtended;
        }

        var raw = Environment.GetEnvironmentVariable("CHAT_MAX_TOOL_ROUNDS")?.Trim();
        if (int.TryParse(raw, out var parsed) && parsed > 0)
        {
            return parsed;
        }

        return MaxToolRoundsDefault;
    }

    public static string ResolveSystemPrompt(LlmSettings settings)
    {
        var prompt = LlmPrompts.ChatAgentSystemBase;
        if (settings.ChatAllowCrawl)
        {
            return prompt + LlmPrompts.ChatAgentCrawlSuffix;
        }

        return prompt + LlmPrompts.ChatAgentReadOnlySuffix;
    }

    public static bool ChatAllowCrawl(LlmSettings settings) => settings.ChatAllowCrawl;

    public static bool FastNarrativeEnabled(LlmSettings? settings = null)
    {
        var env = Environment.GetEnvironmentVariable("CHAT_FAST_NARRATIVE")?.Trim();
        if (!string.IsNullOrEmpty(env))
        {
            return LlmConfigHelpers.IsTruthy(env);
        }

        return settings?.ChatFastNarrative ?? false;
    }

    private static readonly HashSet<string> WorkflowToolNames = new(StringComparer.Ordinal)
    {
        "run_insight_workflow",
        "run_technical_workflow",
        "run_keyword_workflow",
        "run_domain_agent",
    };

    public static bool ShouldFastFinishAfterBatch(IReadOnlyList<ChatToolEvent> batch, LlmSettings settings)
    {
        if (!FastNarrativeEnabled(settings) || batch.Count == 0)
        {
            return false;
        }

        return batch.All(ev =>
        {
            if (!WorkflowToolNames.Contains(ev.Name))
            {
                return false;
            }

            if (System.Text.Json.Nodes.JsonNode.Parse(ev.ResultJson) is not System.Text.Json.Nodes.JsonObject parsed)
            {
                return false;
            }

            return parsed["error"] is null;
        });
    }

    public static string MapAgentError(Exception ex, LlmSettings settings)
    {
        var msg = ex.Message.Trim();
        if (string.IsNullOrEmpty(msg))
        {
            msg = ex.GetType().Name;
        }

        var provider = settings.Provider.Trim().ToLowerInvariant();
        if (msg.Contains("Connection error", StringComparison.OrdinalIgnoreCase) && provider == "groq")
        {
            return
                "Could not reach Groq. Check your Groq API key on the Secrets page and " +
                "that outbound HTTPS to api.groq.com is allowed. " +
                $"Details: {msg}";
        }

        if (msg.Contains("httpx", StringComparison.OrdinalIgnoreCase) ||
            msg.Contains("requirements.txt", StringComparison.OrdinalIgnoreCase))
        {
            return
                "LLM dependencies are missing. Run: pip install -r requirements.txt " +
                $"(or restart with ./local-run setup). Details: {msg}";
        }

        if (msg.Contains("tool_use_failed", StringComparison.OrdinalIgnoreCase) ||
            msg.Contains("not in request.tools", StringComparison.OrdinalIgnoreCase))
        {
            return
                "The assistant tried to use an audit tool that was not loaded for this chat step. " +
                "Try your question again, use search_audit_tools first, or set chat tool mode to full in AI settings. " +
                $"Details: {msg}";
        }

        return msg;
    }
}
