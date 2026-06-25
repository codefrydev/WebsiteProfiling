namespace AiService.Providers.Chat;

public static class LlmConfigHelpers
{
    private static readonly string[] CloudProviders = ["openai", "gemini", "anthropic", "groq"];

    private static readonly Dictionary<string, string> EnvKeyByProvider = new(StringComparer.OrdinalIgnoreCase)
    {
        ["openai"] = "OPENAI_API_KEY",
        ["gemini"] = "GEMINI_API_KEY",
        ["anthropic"] = "ANTHROPIC_API_KEY",
        ["groq"] = "GROQ_API_KEY",
    };

    public static bool IsEnabled(IReadOnlyDictionary<string, string> cfg)
    {
        if (cfg.Count == 0)
        {
            return false;
        }

        if (!IsTruthy(cfg.GetValueOrDefault("llm_enabled")))
        {
            return false;
        }

        var provider = (cfg.GetValueOrDefault("llm_provider") ?? "none").Trim().ToLowerInvariant();
        return provider is not "" and not "none";
    }

    public static bool IsTruthy(string? value)
        => (value ?? "").Trim().ToLowerInvariant() is "true" or "1" or "yes";

    public static IReadOnlyDictionary<string, string> WithResolvedApiKey(IReadOnlyDictionary<string, string> cfg)
    {
        var provider = (cfg.GetValueOrDefault("llm_provider") ?? "none").Trim().ToLowerInvariant();
        var resolved = ResolveApiKey(cfg, provider);
        if (string.IsNullOrWhiteSpace(resolved))
        {
            return cfg;
        }

        var copy = new Dictionary<string, string>(cfg, StringComparer.Ordinal)
        {
            ["llm_api_key"] = resolved,
        };
        return copy;
    }

    public static string ResolveApiKey(IReadOnlyDictionary<string, string> cfg, string? provider = null)
    {
        provider ??= (cfg.GetValueOrDefault("llm_provider") ?? "none").Trim().ToLowerInvariant();

        if (CloudProviders.Contains(provider, StringComparer.OrdinalIgnoreCase))
        {
            var perProviderKey = $"llm_api_key_{provider}";
            var specific = (cfg.GetValueOrDefault(perProviderKey) ?? "").Trim();
            if (!string.IsNullOrEmpty(specific))
            {
                return specific;
            }
        }

        var generic = (cfg.GetValueOrDefault("llm_api_key") ?? "").Trim();
        if (!string.IsNullOrEmpty(generic))
        {
            return generic;
        }

        if (EnvKeyByProvider.TryGetValue(provider, out var envVar))
        {
            return (Environment.GetEnvironmentVariable(envVar) ?? "").Trim();
        }

        return "";
    }

    public static bool IsOllamaBaseUrl(string? url)
    {
        var normalized = (url ?? "").Trim().TrimEnd('/').ToLowerInvariant();
        if (normalized is "http://127.0.0.1:11434" or "http://localhost:11434")
        {
            return true;
        }

        return normalized.EndsWith(":11434", StringComparison.Ordinal);
    }

    public static string? OptionalCloudBaseUrl(IReadOnlyDictionary<string, string> cfg)
    {
        var baseUrl = (cfg.GetValueOrDefault("llm_base_url") ?? "").Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl) || IsOllamaBaseUrl(baseUrl))
        {
            return null;
        }

        return baseUrl;
    }

    public static double TimeoutSeconds(IReadOnlyDictionary<string, string> cfg, double defaultSeconds = 120)
    {
        var raw = (cfg.GetValueOrDefault("llm_timeout_s") ?? "").Trim();
        return double.TryParse(raw, out var seconds) && seconds > 0 ? seconds : defaultSeconds;
    }

    public static string ModelOrDefault(IReadOnlyDictionary<string, string> cfg, string defaultModel)
        => (cfg.GetValueOrDefault("llm_model") ?? defaultModel).Trim();
}
