using System.Text;
using System.Text.Json.Nodes;
using AiService.Domain.Models;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;

namespace AiService.Providers.Chat;

/// <summary>Structured JSON completions via <see cref="IChatClient"/>.</summary>
public sealed class StructuredCompletionService(IChatClientFactory chatClientFactory, ILogger<StructuredCompletionService> logger)
{
    public Task<JsonObject> CompleteJsonAsync(
        string system,
        string user,
        LlmSettings settings,
        CancellationToken cancellationToken = default)
        => CompleteJsonStreamingAsync(system, user, settings, onToken: null, cancellationToken);

    /// <summary>Returns null when the provider is unreachable (Ollama down, network error, timeout).</summary>
    public async Task<JsonObject?> TryCompleteJsonAsync(
        string system,
        string user,
        LlmSettings settings,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await CompleteJsonAsync(system, user, settings, cancellationToken);
        }
        catch (Exception ex) when (LlmTransportFailures.IsUnavailable(ex))
        {
            logger.LogWarning("LLM completion skipped: {Reason}", LlmTransportFailures.Describe(ex));
            return null;
        }
    }

    public async Task<JsonObject> CompleteJsonStreamingAsync(
        string system,
        string user,
        LlmSettings settings,
        Action<string>? onToken,
        CancellationToken cancellationToken = default)
    {
        var client = chatClientFactory.CreateClient(settings);
        var messages = new List<ChatMessage>
        {
            new(ChatRole.System, system),
            new(ChatRole.User, user),
        };

        var options = new ChatOptions
        {
            Temperature = 0.2f,
            ResponseFormat = ChatResponseFormat.Json,
        };

        if (onToken is null)
        {
            var response = await client.GetResponseAsync(messages, options, cancellationToken);
            var text = response.Text ?? "";
            return string.IsNullOrWhiteSpace(text) ? [] : JsonResponseParser.Parse(text);
        }

        var accumulated = new StringBuilder();
        await foreach (var update in client.GetStreamingResponseAsync(messages, options, cancellationToken))
        {
            var delta = update.Text ?? "";
            if (string.IsNullOrEmpty(delta))
            {
                continue;
            }

            accumulated.Append(delta);
            onToken(delta);
        }

        var fullText = accumulated.ToString();
        return string.IsNullOrWhiteSpace(fullText) ? [] : JsonResponseParser.Parse(fullText);
    }
}
