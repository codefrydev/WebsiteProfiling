using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.AI;

namespace AiService.Providers.Chat;

/// <summary>MEAI <see cref="IChatClient"/> adapter over the Anthropic Messages HTTP API.</summary>
internal sealed class AnthropicChatClient(string apiKey, string model, TimeSpan timeout) : IChatClient
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly HttpClient _http = new() { Timeout = timeout };

    public ChatClientMetadata Metadata { get; } = new("anthropic");

    public void Dispose() => _http.Dispose();

    public object? GetService(global::System.Type serviceType, object? serviceKey = null)
        => serviceType.IsInstanceOfType(this) ? this : null;

    public async Task<ChatResponse> GetResponseAsync(
        IEnumerable<ChatMessage> chatMessages,
        ChatOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var (system, messages) = ToAnthropicMessages(chatMessages);
        if (options?.ResponseFormat == ChatResponseFormat.Json)
        {
            system = $"{system}\nRespond with valid JSON only.".Trim();
        }

        var payload = new JsonObject
        {
            ["model"] = model,
            ["max_tokens"] = 4096,
            ["system"] = system,
            ["messages"] = messages,
        };

        if (options?.Tools is { Count: > 0 })
        {
            payload["tools"] = ToAnthropicTools(options.Tools);
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
        {
            Content = JsonContent.Create(payload, options: JsonOptions),
        };
        request.Headers.Add("x-api-key", apiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await _http.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonObject>(cancellationToken)
            ?? throw new InvalidOperationException("Anthropic returned an empty response.");

        return ToChatResponse(body);
    }

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> chatMessages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var response = await GetResponseAsync(chatMessages, options, cancellationToken);
        yield return new ChatResponseUpdate(ChatRole.Assistant, response.Text);
    }

    private static (string System, JsonArray Messages) ToAnthropicMessages(IEnumerable<ChatMessage> chatMessages)
    {
        var systemParts = new List<string>();
        var messages = new JsonArray();

        foreach (var message in chatMessages)
        {
            if (message.Role == ChatRole.System)
            {
                systemParts.Add(message.Text ?? "");
                continue;
            }

            if (message.Role == ChatRole.Tool)
            {
                var toolResult = message.Contents.OfType<FunctionResultContent>().FirstOrDefault();
                messages.Add(new JsonObject
                {
                    ["role"] = "user",
                    ["content"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["type"] = "tool_result",
                            ["tool_use_id"] = toolResult?.CallId ?? "",
                            ["content"] = toolResult?.Result?.ToString() ?? message.Text ?? "",
                        },
                    },
                });
                continue;
            }

            if (message.Role == ChatRole.Assistant)
            {
                var blocks = new JsonArray();
                if (!string.IsNullOrEmpty(message.Text))
                {
                    blocks.Add(new JsonObject { ["type"] = "text", ["text"] = message.Text });
                }

                foreach (var call in message.Contents.OfType<FunctionCallContent>())
                {
                    blocks.Add(new JsonObject
                    {
                        ["type"] = "tool_use",
                        ["id"] = call.CallId,
                        ["name"] = call.Name,
                        ["input"] = JsonSerializer.SerializeToNode(call.Arguments ?? new Dictionary<string, object?>()) ?? new JsonObject(),
                    });
                }

                messages.Add(new JsonObject { ["role"] = "assistant", ["content"] = blocks });
                continue;
            }

            messages.Add(new JsonObject
            {
                ["role"] = "user",
                ["content"] = message.Text ?? "",
            });
        }

        return (string.Join('\n', systemParts), messages);
    }

    private static JsonArray ToAnthropicTools(IList<AITool> tools)
    {
        var outTools = new JsonArray();
        foreach (var tool in tools.OfType<AIFunction>())
        {
            outTools.Add(new JsonObject
            {
                ["name"] = tool.Name,
                ["description"] = tool.Description ?? "",
                ["input_schema"] = new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject(),
                },
            });
        }

        return outTools;
    }

    private static ChatResponse ToChatResponse(JsonObject body)
    {
        var contents = new List<AIContent>();
        if (body["content"] is JsonArray blocks)
        {
            foreach (var blockNode in blocks)
            {
                if (blockNode is not JsonObject block)
                {
                    continue;
                }

                var type = block["type"]?.GetValue<string>();
                if (type == "text")
                {
                    var text = block["text"]?.GetValue<string>() ?? "";
                    contents.Add(new TextContent(text));
                }
                else if (type == "tool_use")
                {
                    var args = block["input"] as JsonObject ?? [];
                    var dict = JsonSerializer.Deserialize<Dictionary<string, object?>>(args.ToJsonString())
                        ?? new Dictionary<string, object?>();
                    contents.Add(new FunctionCallContent(
                        block["id"]?.GetValue<string>() ?? "",
                        block["name"]?.GetValue<string>() ?? "",
                        dict));
                }
            }
        }

        return new ChatResponse(new ChatMessage(ChatRole.Assistant, contents))
        {
            ModelId = body["model"]?.GetValue<string>(),
        };
    }
}
