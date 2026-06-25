using System.Runtime.CompilerServices;
using System.Text.Json.Nodes;
using AiService.Providers.Chat;
using Microsoft.Extensions.AI;

namespace AiService.Tests;

public sealed class StructuredCompletionStreamingTests
{
    [Fact]
    public async Task CompleteJsonStreamingAsync_emits_tokens_and_parses_json()
    {
        var factory = new FakeChatClientFactory(["{\"power_", "insights\": [\"Hello\"]}"]);
        var service = new StructuredCompletionService(factory);
        var tokens = new List<string>();

        var result = await service.CompleteJsonStreamingAsync(
            "system",
            "user",
            new Dictionary<string, string> { ["llm_provider"] = "openai", ["openai_api_key"] = "test" },
            tokens.Add);

        Assert.Equal(2, tokens.Count);
        Assert.Equal("Hello", result["power_insights"]![0]!.GetValue<string>());
    }

    [Fact]
    public async Task CompleteJsonAsync_delegates_to_streaming_without_tokens()
    {
        var factory = new FakeChatClientFactory(["{\"ok\": true}"]);
        var service = new StructuredCompletionService(factory);

        var result = await service.CompleteJsonAsync(
            "system",
            "user",
            new Dictionary<string, string> { ["llm_provider"] = "openai", ["openai_api_key"] = "test" });

        Assert.True(result["ok"]!.GetValue<bool>());
    }

    private sealed class FakeChatClientFactory(string[] chunks) : IChatClientFactory
    {
        public Task<IChatClient> CreateFromConfigAsync(CancellationToken cancellationToken = default)
            => Task.FromResult<IChatClient>(CreateClient(new Dictionary<string, string>()));

        public IChatClient CreateClient(IReadOnlyDictionary<string, string> cfg)
            => new FakeChatClient(chunks);
    }

    private sealed class FakeChatClient(string[] chunks) : IChatClient
    {
        public ChatClientMetadata Metadata { get; } = new("fake");

        public void Dispose()
        {
        }

        public object? GetService(Type serviceType, object? serviceKey = null)
            => serviceType.IsInstanceOfType(this) ? this : null;

        public Task<ChatResponse> GetResponseAsync(
            IEnumerable<ChatMessage> chatMessages,
            ChatOptions? options = null,
            CancellationToken cancellationToken = default)
        {
            var text = string.Concat(chunks);
            return Task.FromResult(new ChatResponse(new ChatMessage(ChatRole.Assistant, text)));
        }

        public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<ChatMessage> chatMessages,
            ChatOptions? options = null,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            foreach (var chunk in chunks)
            {
                yield return new ChatResponseUpdate(ChatRole.Assistant, chunk);
                await Task.Yield();
            }
        }
    }
}
