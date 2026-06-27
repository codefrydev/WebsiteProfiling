using AiService.Domain.Models;

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

    public static bool IsEnabled(LlmSettings settings)
    {
        if (!settings.Enabled)
        {
            return false;
        }

        var provider = settings.Provider.Trim().ToLowerInvariant();
        return provider is not "" and not "none";
    }

    public static bool IsTruthy(string? value)
        => (value ?? "").Trim().ToLowerInvariant() is "true" or "1" or "yes";

    public static string ResolveApiKey(LlmSettings settings, string? provider = null)
    {
        provider ??= settings.Provider.Trim().ToLowerInvariant();

        if (CloudProviders.Contains(provider, StringComparer.OrdinalIgnoreCase))
        {
            var profile = settings.Providers.FirstOrDefault(
                p => string.Equals(p.Provider, provider, StringComparison.OrdinalIgnoreCase));
            var specific = (profile?.ApiKey ?? "").Trim();
            if (!string.IsNullOrEmpty(specific))
            {
                return specific;
            }
        }

        if (EnvKeyByProvider.TryGetValue(provider, out var envVar))
        {
            return (Environment.GetEnvironmentVariable(envVar) ?? "").Trim();
        }

        return "";
    }

    public static bool IsApiKeyConfigured(LlmSettings settings)
    {
        var provider = settings.Provider.Trim().ToLowerInvariant();
        if (provider is "" or "none")
        {
            return false;
        }

        if (provider == "ollama")
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(ResolveApiKey(settings));
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

    public static string? OptionalCloudBaseUrl(LlmSettings settings)
    {
        var baseUrl = settings.OllamaBaseUrl.Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl) || IsOllamaBaseUrl(baseUrl))
        {
            return null;
        }

        return baseUrl;
    }

    public static double TimeoutSeconds(LlmSettings settings, double defaultSeconds = 120)
        => settings.TimeoutSeconds > 0 ? settings.TimeoutSeconds : defaultSeconds;

    public static string ModelOrDefault(LlmSettings settings, string defaultModel)
        => string.IsNullOrWhiteSpace(settings.ActiveModel) ? defaultModel : settings.ActiveModel.Trim();

    public static string DisplayModel(LlmSettings settings)
        => string.IsNullOrWhiteSpace(settings.ActiveModel)
            ? settings.Provider.Trim()
            : settings.ActiveModel.Trim();
}
