using System.ClientModel;
using AiService.Domain.Repositories;
using Microsoft.Extensions.AI;
using OpenAI;

namespace AiService.Providers.Chat;

public sealed class ChatClientFactory(ILlmConfigRepository configRepository) : IChatClientFactory
{
    public async Task<IChatClient> CreateFromConfigAsync(CancellationToken cancellationToken = default)
    {
        var cfg = await configRepository.LoadAsync(cancellationToken);
        return CreateClient(cfg);
    }

    public IChatClient CreateClient(IReadOnlyDictionary<string, string> cfg)
    {
        var resolved = LlmConfigHelpers.WithResolvedApiKey(cfg);
        var provider = (resolved.GetValueOrDefault("llm_provider") ?? "none").Trim().ToLowerInvariant();

        return provider switch
        {
            "openai" => CreateOpenAiClient(resolved, endpoint: null, defaultModel: "gpt-4o-mini"),
            "groq" => CreateOpenAiClient(
                resolved,
                endpoint: new Uri(LlmConfigHelpers.OptionalCloudBaseUrl(resolved) ?? "https://api.groq.com/openai/v1"),
                defaultModel: "openai/gpt-oss-120b"),
            "gemini" => CreateOpenAiClient(
                resolved,
                endpoint: new Uri(LlmConfigHelpers.OptionalCloudBaseUrl(resolved)
                    ?? "https://generativelanguage.googleapis.com/v1beta/openai/"),
                defaultModel: "gemini-2.0-flash"),
            "anthropic" => CreateAnthropicClient(resolved),
            "ollama" => CreateOllamaClient(resolved),
            _ => throw new InvalidOperationException($"Unknown LLM provider: {provider}"),
        };
    }

    private static IChatClient CreateOpenAiClient(
        IReadOnlyDictionary<string, string> cfg,
        Uri? endpoint,
        string defaultModel)
    {
        var apiKey = LlmConfigHelpers.ResolveApiKey(cfg);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("LLM API key is missing for the configured provider.");
        }

        var model = LlmConfigHelpers.ModelOrDefault(cfg, defaultModel);
        var options = endpoint is null
            ? null
            : new OpenAIClientOptions { Endpoint = endpoint };

        var client = options is null
            ? new OpenAIClient(new ApiKeyCredential(apiKey))
            : new OpenAIClient(new ApiKeyCredential(apiKey), options);

        return client.GetChatClient(model).AsIChatClient();
    }

    private static IChatClient CreateAnthropicClient(IReadOnlyDictionary<string, string> cfg)
    {
        var apiKey = LlmConfigHelpers.ResolveApiKey(cfg);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Anthropic API key is missing.");
        }

        var model = LlmConfigHelpers.ModelOrDefault(cfg, "claude-3-5-haiku-latest");
        var timeout = TimeSpan.FromSeconds(LlmConfigHelpers.TimeoutSeconds(cfg));
        return new AnthropicChatClient(apiKey, model, timeout);
    }

    private static IChatClient CreateOllamaClient(IReadOnlyDictionary<string, string> cfg)
    {
        var baseUrl = (cfg.GetValueOrDefault("llm_base_url") ?? "http://127.0.0.1:11434").Trim().TrimEnd('/');
        var model = LlmConfigHelpers.ModelOrDefault(cfg, "llama3.2");
        return new OllamaChatClient(new Uri(baseUrl), model);
    }
}
