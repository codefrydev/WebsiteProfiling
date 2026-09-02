using System.ClientModel;
using AiService.Api.Domain;
using AiService.Api.Domain.Models;
using AiService.Api.Domain.Repositories;
using Microsoft.Extensions.AI;
using OpenAI;

namespace AiService.Api.Providers.Chat;

public sealed class ChatClientFactory(ILlmSettingsRepository configRepository) : IChatClientFactory
{
    public async Task<IChatClient> CreateFromConfigAsync(CancellationToken cancellationToken = default)
    {
        var settings = await configRepository.LoadAsync(cancellationToken);
        return CreateClient(settings);
    }

    public IChatClient CreateClient(LlmSettings settings)
    {
        var provider = settings.Provider.Trim().ToLowerInvariant();

        return provider switch
        {
            LlmProviders.OpenAi => CreateOpenAiClient(settings, endpoint: null, defaultModel: "gpt-4o-mini"),
            LlmProviders.Groq => CreateOpenAiClient(
                settings,
                endpoint: new Uri(LlmConfigHelpers.OptionalCloudBaseUrl(settings) ?? "https://api.groq.com/openai/v1"),
                defaultModel: "openai/gpt-oss-120b"),
            LlmProviders.Gemini => CreateOpenAiClient(
                settings,
                endpoint: new Uri(LlmConfigHelpers.OptionalCloudBaseUrl(settings)
                    ?? "https://generativelanguage.googleapis.com/v1beta/openai/"),
                defaultModel: "gemini-2.0-flash"),
            LlmProviders.Anthropic => CreateAnthropicClient(settings),
            LlmProviders.Ollama => CreateOllamaClient(settings),
            _ => throw new InvalidOperationException($"Unknown LLM provider: {provider}"),
        };
    }

    private static IChatClient CreateOpenAiClient(
        LlmSettings settings,
        Uri? endpoint,
        string defaultModel)
    {
        var apiKey = LlmConfigHelpers.ResolveApiKey(settings);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("LLM API key is missing for the configured provider.");
        }

        var model = LlmConfigHelpers.ModelOrDefault(settings, defaultModel);
        var options = endpoint is null
            ? null
            : new OpenAIClientOptions { Endpoint = endpoint };

        var client = options is null
            ? new OpenAIClient(new ApiKeyCredential(apiKey))
            : new OpenAIClient(new ApiKeyCredential(apiKey), options);

        return client.GetChatClient(model).AsIChatClient();
    }

    private static IChatClient CreateAnthropicClient(LlmSettings settings)
    {
        var apiKey = LlmConfigHelpers.ResolveApiKey(settings);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Anthropic API key is missing.");
        }

        var model = LlmConfigHelpers.ModelOrDefault(settings, "claude-3-5-haiku-latest");
        var timeout = TimeSpan.FromSeconds(LlmConfigHelpers.TimeoutSeconds(settings));
        return new AnthropicChatClient(apiKey, model, timeout);
    }

    private static IChatClient CreateOllamaClient(LlmSettings settings)
    {
        var baseUrl = settings.OllamaBaseUrl.Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl))
        {
            baseUrl = OllamaDefaults.BaseUrl;
        }

        var model = LlmConfigHelpers.ModelOrDefault(settings, "llama3.2");
        return new OllamaChatClient(new Uri(baseUrl), model);
    }
}
