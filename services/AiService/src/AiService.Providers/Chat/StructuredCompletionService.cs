using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.AI;

namespace AiService.Providers.Chat;

/// <summary>Structured JSON completions via <see cref="IChatClient"/>.</summary>
public sealed class StructuredCompletionService(IChatClientFactory chatClientFactory)
{
    public Task<JsonObject> CompleteJsonAsync(
        string system,
        string user,
        IReadOnlyDictionary<string, string> cfg,
        CancellationToken cancellationToken = default)
        => CompleteJsonStreamingAsync(system, user, cfg, onToken: null, cancellationToken);

    public async Task<JsonObject> CompleteJsonStreamingAsync(
        string system,
        string user,
        IReadOnlyDictionary<string, string> cfg,
        Action<string>? onToken,
        CancellationToken cancellationToken = default)
    {
        var client = chatClientFactory.CreateClient(cfg);
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
