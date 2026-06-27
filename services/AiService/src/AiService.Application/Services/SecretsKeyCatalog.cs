namespace AiService.Application.Services;

/// <summary>Key routing for unified secrets API — mirrors web/src/lib/secretsConfigSchema.ts.</summary>
internal static class SecretsKeyCatalog
{
    internal const string Mask = "*";

    internal static readonly HashSet<string> PipelineSecretKeys = new(StringComparer.Ordinal)
    {
        "bing_webmaster_api_key",
        "serp_api_key",
        "google_rich_results_api_key",
        "crawl_auth_password",
        "crawl_cookies",
        "mcp_token",
    };

    internal static readonly HashSet<string> McpManagedKeys = new(StringComparer.Ordinal)
    {
        "mcp_token",
        "mcp_allowed_hosts",
        "mcp_allowed_origins",
        "mcp_public_url",
        "mcp_domain",
        "mcp_enabled_domains",
    };

    internal static readonly HashSet<string> RiskSettingsKeys = new(StringComparer.Ordinal)
    {
        "mcp_disabled_tools",
        "mcp_enabled_domains",
        "feature_pipeline_enabled",
        "feature_write_enabled",
        "feature_pages_md_enabled",
        "feature_chat_enabled",
        "feature_mcp_visible",
        "feature_secrets_visible",
    };

    internal static readonly HashSet<string> LlmApiKeyFields = new(StringComparer.Ordinal)
    {
        "llm_api_key",
        "llm_api_key_openai",
        "llm_api_key_gemini",
        "llm_api_key_anthropic",
        "llm_api_key_groq",
    };

    internal static readonly HashSet<string> GoogleStateKeys = new(StringComparer.Ordinal)
    {
        "google_client_id",
        "google_client_secret",
        "google_service_account_json",
        "google_developer_token",
        "google_login_customer_id",
    };

    internal enum SecretsStorage
    {
        Llm,
        Pipeline,
        Google,
    }

    internal static SecretsStorage? ResolveStorage(string key)
    {
        if (key.StartsWith("google_", StringComparison.Ordinal))
        {
            return SecretsStorage.Google;
        }

        if (PipelineSecretKeys.Contains(key) || McpManagedKeys.Contains(key) || RiskSettingsKeys.Contains(key))
        {
            return SecretsStorage.Pipeline;
        }

        if (LlmApiKeyFields.Contains(key) || ConfigSecretHelpers.IsSecretKey(key))
        {
            return SecretsStorage.Llm;
        }

        return null;
    }

    internal static bool IsPipelineSecretKey(string key) => PipelineSecretKeys.Contains(key);

    internal static bool IsManagedPipelineKey(string key)
        => PipelineSecretKeys.Contains(key)
           || McpManagedKeys.Contains(key)
           || RiskSettingsKeys.Contains(key);

    internal static string? GoogleFieldFromStateKey(string key)
    {
        if (!key.StartsWith("google_", StringComparison.Ordinal))
        {
            return null;
        }

        return key["google_".Length..];
    }
}

internal static class ConfigSecretHelpers
{
    internal const string Mask = SecretsKeyCatalog.Mask;

    internal static bool IsSecretKey(string key)
    {
        var keyLower = key.ToLowerInvariant();
        return keyLower.EndsWith("_secret", StringComparison.Ordinal)
               || keyLower.EndsWith("_api_key", StringComparison.Ordinal)
               || keyLower.EndsWith("_key", StringComparison.Ordinal)
               || keyLower.Contains("api_key", StringComparison.Ordinal)
               || keyLower.Contains("secret", StringComparison.Ordinal)
               || keyLower.Contains("password", StringComparison.Ordinal)
               || keyLower.Contains("token", StringComparison.Ordinal);
    }

    internal static bool IsMaskedSentinel(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();
        if (trimmed is Mask or "••••" or "{configured}")
        {
            return true;
        }

        return trimmed.StartsWith('*') && trimmed.Length <= 4;
    }

    /// <summary>Blank or masked writes must not replace an existing stored secret.</summary>
    internal static bool ShouldPreserveExistingSecret(string key, string? incoming, string? existing)
    {
        if (string.IsNullOrWhiteSpace(existing))
        {
            return false;
        }

        if (IsMaskedSentinel(incoming))
        {
            return true;
        }

        if (!IsSecretKey(key) && !SecretsKeyCatalog.LlmApiKeyFields.Contains(key)
            && !SecretsKeyCatalog.IsPipelineSecretKey(key))
        {
            return false;
        }

        if (key.StartsWith("google_", StringComparison.Ordinal)
            && key is not ("google_client_secret" or "google_developer_token" or "google_service_account_json"))
        {
            return false;
        }

        return string.IsNullOrWhiteSpace(incoming);
    }
}
