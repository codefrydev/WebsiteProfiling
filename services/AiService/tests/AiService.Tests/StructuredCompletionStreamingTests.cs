using System.Net.Http;
using System.Net.Sockets;
using System.Runtime.CompilerServices;
using System.Text.Json.Nodes;
using AiService.Domain.Models;
using AiService.Providers.Chat;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging.Abstractions;

namespace AiService.Tests;

public sealed class StructuredCompletionStreamingTests
{
    [Fact]
    public async Task CompleteJsonStreamingAsync_emits_tokens_and_parses_json()
    {
        var factory = new FakeChatClientFactory(["{\"power_", "insights\": [\"Hello\"]}"]);
        var service = new StructuredCompletionService(factory, NullLogger<StructuredCompletionService>.Instance);
        var tokens = new List<string>();
        var settings = new LlmSettings { Provider = "openai", Enabled = true };

        var result = await service.CompleteJsonStreamingAsync(
            "system",
            "user",
            settings,
            tokens.Add);

        Assert.Equal(2, tokens.Count);
        Assert.Equal("Hello", result["power_insights"]![0]!.GetValue<string>());
    }

    [Fact]
    public async Task CompleteJsonAsync_delegates_to_streaming_without_tokens()
    {
        var factory = new FakeChatClientFactory(["{\"ok\": true}"]);
        var service = new StructuredCompletionService(factory, NullLogger<StructuredCompletionService>.Instance);
        var settings = new LlmSettings { Provider = "openai", Enabled = true };

        var result = await service.CompleteJsonAsync(
            "system",
            "user",
            settings);

        Assert.True(result["ok"]!.GetValue<bool>());
    }

    [Fact]
    public async Task TryCompleteJsonAsync_returns_null_when_provider_unreachable()
    {
        var factory = new ThrowingChatClientFactory(
            new HttpRequestException("Connection refused (127.0.0.1:11434)", new SocketException(61)));
        var service = new StructuredCompletionService(factory, NullLogger<StructuredCompletionService>.Instance);
        var settings = new LlmSettings { Provider = "ollama", Enabled = true };

        var result = await service.TryCompleteJsonAsync("system", "user", settings);

        Assert.Null(result);
    }

    private sealed class ThrowingChatClientFactory(Exception error) : IChatClientFactory
    {
        public Task<IChatClient> CreateFromConfigAsync(CancellationToken cancellationToken = default)
            => Task.FromResult<IChatClient>(CreateClient(new LlmSettings()));

        public IChatClient CreateClient(LlmSettings settings) => new ThrowingChatClient(error);
    }

    private sealed class ThrowingChatClient(Exception error) : IChatClient
    {
        public ChatClientMetadata Metadata { get; } = new("throwing");

        public void Dispose()
        {
        }

        public object? GetService(Type serviceType, object? serviceKey = null)
            => serviceType.IsInstanceOfType(this) ? this : null;

        public Task<ChatResponse> GetResponseAsync(
            IEnumerable<ChatMessage> chatMessages,
            ChatOptions? options = null,
            CancellationToken cancellationToken = default)
            => Task.FromException<ChatResponse>(error);

        public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<ChatMessage> chatMessages,
            ChatOptions? options = null,
            CancellationToken cancellationToken = default)
            => throw error;
    }

    private sealed class FakeChatClientFactory(string[] chunks) : IChatClientFactory
    {
        public Task<IChatClient> CreateFromConfigAsync(CancellationToken cancellationToken = default)
            => Task.FromResult<IChatClient>(CreateClient(new LlmSettings()));

        public IChatClient CreateClient(LlmSettings settings)
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
