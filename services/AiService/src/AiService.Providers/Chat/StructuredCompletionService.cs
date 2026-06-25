using System.Text.Json.Nodes;
using Microsoft.Extensions.AI;

namespace AiService.Providers.Chat;

/// <summary>Structured JSON completions via <see cref="IChatClient"/>.</summary>
public sealed class StructuredCompletionService(IChatClientFactory chatClientFactory)
{
    public async Task<JsonObject> CompleteJsonAsync(
        string system,
        string user,
        IReadOnlyDictionary<string, string> cfg,
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

        var response = await client.GetResponseAsync(messages, options, cancellationToken);
        var text = response.Text ?? "";
        if (string.IsNullOrWhiteSpace(text))
        {
            return [];
        }

        return JsonResponseParser.Parse(text);
    }
}
