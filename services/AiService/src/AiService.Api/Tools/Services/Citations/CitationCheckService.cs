using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Api.Domain;
using AiService.Api.Domain.Models;
using AiService.Api.Domain.Repositories;

namespace AiService.Api.Tools.Services.Citations;

/// <summary>
/// Live AI citation checks — ports Python <c>integrations/ai_citations</c>.
/// </summary>
public sealed partial class CitationCheckService(
    ILlmSettingsRepository llmSettingsRepository,
    IHttpClientFactory httpClientFactory)
{
    public async Task<string?> ResolveApiKeyAsync(
        string provider,
        string? providedKey,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(providedKey))
        {
            return providedKey.Trim();
        }

        var normalized = provider.Trim().ToLowerInvariant();
        var envName = LlmProviders.ApiKeyEnvVarByProvider.GetValueOrDefault(normalized);
        if (envName is not null)
        {
            var envVal = Environment.GetEnvironmentVariable(envName)?.Trim();
            if (!string.IsNullOrEmpty(envVal))
            {
                return envVal;
            }
        }

        try
        {
            var settings = await llmSettingsRepository.LoadAsync(cancellationToken);
            var fromSettings = ResolveApiKeyFromSettings(settings, normalized);
            if (!string.IsNullOrWhiteSpace(fromSettings))
            {
                return fromSettings.Trim();
            }
        }
        catch
        {
            // llm_settings optional
        }

        return null;
    }

    private static string ResolveApiKeyFromSettings(LlmSettings settings, string provider)
    {
        var profile = settings.Providers.FirstOrDefault(
            p => string.Equals(p.Provider, provider, StringComparison.OrdinalIgnoreCase));
        return (profile?.ApiKey ?? "").Trim();
    }

    public async Task<CitationResult> CheckAsync(
        CitationCheckRequest request,
        CancellationToken cancellationToken = default)
    {
        var provider = (request.Provider ?? LlmProviders.Perplexity).Trim().ToLowerInvariant();
        var key = await ResolveApiKeyAsync(provider, request.ApiKey, cancellationToken)
            ?? throw new InvalidOperationException(
                $"No API key for provider '{provider}'. Set {provider.ToUpperInvariant()}_API_KEY or pass api_key.");

        return provider switch
        {
            LlmProviders.Perplexity => await CheckPerplexityAsync(request, key, cancellationToken),
            LlmProviders.OpenAi => await CheckOpenAiStyleAsync(request, key, LlmProviders.OpenAi, cancellationToken),
            LlmProviders.Anthropic => await CheckAnthropicAsync(request, key, cancellationToken),
            LlmProviders.Groq => await CheckOpenAiStyleAsync(request, key, LlmProviders.Groq, cancellationToken),
            _ => throw new InvalidOperationException(
                $"Unknown citation provider: '{provider}'. Supported: perplexity, openai, anthropic, groq."),
        };
    }

    private async Task<CitationResult> CheckPerplexityAsync(
        CitationCheckRequest request,
        string apiKey,
        CancellationToken cancellationToken)
    {
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.perplexity.ai/chat/completions");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        httpRequest.Content = JsonContent.Create(new
        {
            model = "sonar",
            messages = new[] { new { role = ChatRoles.User, content = request.Query } },
            return_citations = true,
        });

        var client = httpClientFactory.CreateClient(nameof(CitationCheckService));
        using var response = await client.SendAsync(httpRequest, cancellationToken);
        response.EnsureSuccessStatusCode();
        var data = await response.Content.ReadFromJsonAsync<JsonObject>(cancellationToken)
            ?? throw new InvalidOperationException("Empty Perplexity response.");

        var answer = data["choices"]?[0]?["message"]?["content"]?.GetValue<string>() ?? "";
        var sources = new List<string>();
        if (data["citations"] is JsonArray citations)
        {
            foreach (var node in citations)
            {
                if (node is JsonValue v && v.TryGetValue(out string? s) && !string.IsNullOrEmpty(s))
                {
                    sources.Add(s);
                }
                else if (node is JsonObject o)
                {
                    var url = o["url"]?.GetValue<string>() ?? o["link"]?.GetValue<string>() ?? "";
                    if (!string.IsNullOrEmpty(url))
                    {
                        sources.Add(url);
                    }
                }
            }
        }

        return BuildResult(request, LlmProviders.Perplexity, answer, sources, parametricDomain: false);
    }

    private async Task<CitationResult> CheckOpenAiStyleAsync(
        CitationCheckRequest request,
        string apiKey,
        string provider,
        CancellationToken cancellationToken)
    {
        var url = provider == LlmProviders.Groq
            ? "https://api.groq.com/openai/v1/chat/completions"
            : "https://api.openai.com/v1/chat/completions";
        var model = provider == LlmProviders.Groq ? "llama3-8b-8192" : "gpt-4o-mini";
        var prompt = ParametricPrompt(request.Query, request.Brand, request.Domain);

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, url);
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        httpRequest.Content = JsonContent.Create(new
        {
            model,
            messages = new[] { new { role = ChatRoles.User, content = prompt } },
        });

        var client = httpClientFactory.CreateClient(nameof(CitationCheckService));
        using var response = await client.SendAsync(httpRequest, cancellationToken);
        response.EnsureSuccessStatusCode();
        var data = await response.Content.ReadFromJsonAsync<JsonObject>(cancellationToken)
            ?? throw new InvalidOperationException($"Empty {provider} response.");
        var answer = data["choices"]?[0]?["message"]?["content"]?.GetValue<string>() ?? "";
        return BuildResult(request, provider, answer, [], parametricDomain: true);
    }

    private async Task<CitationResult> CheckAnthropicAsync(
        CitationCheckRequest request,
        string apiKey,
        CancellationToken cancellationToken)
    {
        var prompt = ParametricPrompt(request.Query, request.Brand, request.Domain);
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
        httpRequest.Headers.Add("x-api-key", apiKey);
        httpRequest.Headers.Add("anthropic-version", "2023-06-01");
        httpRequest.Content = JsonContent.Create(new
        {
            model = "claude-3-haiku-20240307",
            max_tokens = 512,
            messages = new[] { new { role = ChatRoles.User, content = prompt } },
        });

        var client = httpClientFactory.CreateClient(nameof(CitationCheckService));
        using var response = await client.SendAsync(httpRequest, cancellationToken);
        response.EnsureSuccessStatusCode();
        var data = await response.Content.ReadFromJsonAsync<JsonObject>(cancellationToken)
            ?? throw new InvalidOperationException("Empty Anthropic response.");

        var answer = data["content"] is JsonArray blocks
            ? string.Join(" ", blocks.OfType<JsonObject>().Select(b => b["text"]?.GetValue<string>() ?? ""))
            : "";

        return BuildResult(request, LlmProviders.Anthropic, answer, [], parametricDomain: true);
    }

    private static CitationResult BuildResult(
        CitationCheckRequest request,
        string provider,
        string answer,
        IReadOnlyList<string> sources,
        bool parametricDomain)
    {
        var brandMentioned = answer.Contains(request.Brand, StringComparison.OrdinalIgnoreCase);
        var domainCited = parametricDomain
            ? answer.Contains(StripWww(request.Domain).Split('/')[0], StringComparison.OrdinalIgnoreCase)
            : DomainInSources(request.Domain, sources);

        return new CitationResult(
            request.Query,
            request.Brand,
            request.Domain,
            provider,
            brandMentioned,
            domainCited,
            sources,
            DetectCompetitors(sources, request.Domain),
            answer.Length > 400 ? answer[..400] : answer);
    }

    private static string ParametricPrompt(string query, string brand, string domain) =>
        $"{query}\n\nAfter answering, state whether you know the brand '{brand}' " +
        $"and whether you would cite '{domain}' as a source.";

    private static string StripWww(string domain)
    {
        var d = domain.ToLowerInvariant();
        return d.StartsWith("www.", StringComparison.Ordinal) ? d[4..] : d;
    }

    private static bool DomainInSources(string domain, IReadOnlyList<string> sources)
    {
        var needle = StripWww(domain).Split('/')[0];
        return sources.Any(s => s.Contains(needle, StringComparison.OrdinalIgnoreCase));
    }

    private static IReadOnlyList<string> DetectCompetitors(IReadOnlyList<string> sources, string domain)
    {
        var own = StripWww(domain).Split('/')[0];
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var competitors = new List<string>();
        foreach (var s in sources)
        {
            var m = SourceHostRegex().Match(s);
            if (!m.Success)
            {
                continue;
            }

            var d = m.Groups[1].Value.ToLowerInvariant();
            if (d != own && seen.Add(d))
            {
                competitors.Add(d);
            }

            if (competitors.Count >= 10)
            {
                break;
            }
        }

        return competitors;
    }

    [GeneratedRegex(@"https?://(?:www\.)?([^/\s]+)", RegexOptions.IgnoreCase)]
    private static partial Regex SourceHostRegex();
}
