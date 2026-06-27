using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Application.Repositories;
using AiService.Domain.Models;
using AiService.Domain.Repositories;

namespace AiService.Application.Services;

public sealed class SecretsService(
    ILlmSettingsRepository llmSettings,
    IIntegrationSecretsRepository integrationSecrets,
    IMcpSettingsRepository mcpSettings,
    IFeatureFlagsRepository featureFlags,
    IGoogleAppSettingsRepository googleSettings)
{
    public async Task<JsonObject> GetStateAsync(CancellationToken cancellationToken = default)
    {
        var state = new JsonObject();

        var llmSettingsRow = await llmSettings.LoadForClientAsync(cancellationToken);
        foreach (var profile in llmSettingsRow.Providers)
        {
            if (string.IsNullOrEmpty(profile.ApiKey))
            {
                continue;
            }

            var key = $"llm_api_key_{profile.Provider}";
            state[key] = LlmSettingsSecretMask.Mask;
            state[$"{key}_masked"] = true;
            if (profile.ApiKeyUpdatedAt is { } savedAt)
            {
                state[$"{key}_saved_at"] = savedAt.UtcDateTime.ToString("O");
            }
        }

        var integration = await integrationSecrets.LoadAsync(cancellationToken);
        AddMaskedSecret(state, "bing_webmaster_api_key", integration.BingWebmasterApiKey);
        AddMaskedSecret(state, "serp_api_key", integration.SerpApiKey);
        AddMaskedSecret(state, "google_rich_results_api_key", integration.GoogleRichResultsApiKey);
        AddMaskedSecret(state, "crawl_auth_password", integration.CrawlAuthPassword);
        AddMaskedSecret(state, "crawl_cookies", integration.CrawlCookies);

        var mcp = await mcpSettings.LoadAsync(cancellationToken);
        AddMaskedSecret(state, "mcp_token", mcp.BearerToken);
        AddPlainValue(state, "mcp_allowed_hosts", mcp.AllowedHosts);
        AddPlainValue(state, "mcp_allowed_origins", mcp.AllowedOrigins);
        AddPlainValue(state, "mcp_public_url", mcp.PublicUrl);
        AddPlainValue(state, "mcp_domain", mcp.ToolBundle);
        AddPlainValue(state, "mcp_disabled_tools", mcp.DisabledTools);
        AddPlainValue(state, "mcp_enabled_domains", mcp.EnabledDomains);

        var flags = await featureFlags.LoadAsync(cancellationToken);
        state["feature_pipeline_enabled"] = flags.PipelineEnabled;
        state["feature_write_enabled"] = flags.WriteEnabled;
        state["feature_pages_md_enabled"] = flags.PagesMdEnabled;
        state["feature_chat_enabled"] = flags.ChatEnabled;
        state["feature_mcp_visible"] = flags.McpVisible;
        state["feature_secrets_visible"] = flags.SecretsVisible;

        var google = await googleSettings.LoadAsync(cancellationToken);
        if (!string.IsNullOrEmpty(google.ClientId))
        {
            state["google_client_id"] = google.ClientId;
        }

        if (!string.IsNullOrEmpty(google.ClientSecret))
        {
            state["google_client_secret"] = ConfigSecretHelpers.Mask;
            state["google_client_secret_masked"] = true;
        }

        if (!string.IsNullOrEmpty(google.DeveloperToken))
        {
            state["google_developer_token"] = ConfigSecretHelpers.Mask;
            state["google_developer_token_masked"] = true;
        }

        if (!string.IsNullOrEmpty(google.LoginCustomerId))
        {
            state["google_login_customer_id"] = google.LoginCustomerId;
        }

        if (google.ServiceAccountJson is not null)
        {
            state["google_service_account_json_masked"] = true;
        }

        state["google_has_service_account"] = google.ServiceAccountJson is not null;

        return state;
    }

    public async Task PutStateAsync(JsonObject incoming, CancellationToken cancellationToken = default)
    {
        var llmApiKeyUpdates = new Dictionary<string, string>(StringComparer.Ordinal);
        var integrationPatch = new IntegrationSecretsPatchBuilder();
        var mcpPatch = new McpSettingsPatchBuilder();
        var featurePatch = new FeatureFlagsPatchBuilder();
        var googlePatch = new GoogleAppSettingsPatchBuilder();
        string? genericLlmApiKey = null;

        foreach (var prop in incoming)
        {
            var key = prop.Key;
            if (key.EndsWith("_masked", StringComparison.Ordinal) || key == "google_has_service_account")
            {
                continue;
            }

            var val = prop.Value?.ToString() ?? "";
            if (key.EndsWith("_saved_at", StringComparison.Ordinal))
            {
                continue;
            }

            if (ConfigSecretHelpers.IsMaskedSentinel(val))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(val)
                && (SecretsKeyCatalog.LlmApiKeyFields.Contains(key)
                    || SecretsKeyCatalog.IsPipelineSecretKey(key)
                    || key is "google_client_secret" or "google_developer_token"))
            {
                continue;
            }

            var storage = SecretsKeyCatalog.ResolveStorage(key);
            switch (storage)
            {
                case SecretsKeyCatalog.SecretsStorage.Llm:
                    if (key.StartsWith("llm_api_key_", StringComparison.Ordinal))
                    {
                        var provider = key["llm_api_key_".Length..];
                        if (!string.IsNullOrEmpty(provider))
                        {
                            llmApiKeyUpdates[provider] = val;
                        }
                    }
                    else if (key == "llm_api_key")
                    {
                        genericLlmApiKey = val;
                    }

                    break;
                case SecretsKeyCatalog.SecretsStorage.Pipeline:
                    ApplyPipelinePatch(integrationPatch, mcpPatch, featurePatch, key, val);
                    break;
                case SecretsKeyCatalog.SecretsStorage.Google:
                    ApplyGooglePatch(googlePatch, key, val);
                    break;
            }
        }

        if (genericLlmApiKey is not null)
        {
            var current = await llmSettings.LoadAsync(cancellationToken);
            var provider = current.Provider.Trim().ToLowerInvariant();
            if (provider is not "" and not "none")
            {
                llmApiKeyUpdates[provider] = genericLlmApiKey;
            }
        }

        if (llmApiKeyUpdates.Count > 0)
        {
            foreach (var (provider, apiKey) in llmApiKeyUpdates)
            {
                await llmSettings.MergeProviderApiKeyAsync(provider, apiKey, cancellationToken);
            }
        }

        if (integrationPatch.HasChanges)
        {
            var current = await integrationSecrets.LoadAsync(cancellationToken);
            await integrationSecrets.MergeAsync(integrationPatch.Build(current), cancellationToken);
        }

        if (mcpPatch.HasChanges)
        {
            var current = await mcpSettings.LoadAsync(cancellationToken);
            await mcpSettings.MergeAsync(mcpPatch.Build(current), cancellationToken);
        }

        if (featurePatch.HasChanges)
        {
            await featureFlags.MergeAsync(featurePatch.Build(), cancellationToken);
        }

        if (googlePatch.HasChanges)
        {
            await googleSettings.MergeAsync(googlePatch.Build(), cancellationToken);
        }
    }

    private static void ApplyPipelinePatch(
        IntegrationSecretsPatchBuilder integration,
        McpSettingsPatchBuilder mcp,
        FeatureFlagsPatchBuilder features,
        string key,
        string val)
    {
        switch (key)
        {
            case "bing_webmaster_api_key":
                integration.BingWebmasterApiKey = val;
                break;
            case "serp_api_key":
                integration.SerpApiKey = val;
                break;
            case "google_rich_results_api_key":
                integration.GoogleRichResultsApiKey = val;
                break;
            case "crawl_auth_password":
                integration.CrawlAuthPassword = val;
                break;
            case "crawl_cookies":
                integration.CrawlCookies = val;
                break;
            case "mcp_token":
                mcp.BearerToken = val;
                break;
            case "mcp_allowed_hosts":
                mcp.AllowedHosts = val;
                break;
            case "mcp_allowed_origins":
                mcp.AllowedOrigins = val;
                break;
            case "mcp_public_url":
                mcp.PublicUrl = val;
                break;
            case "mcp_domain":
                mcp.ToolBundle = val;
                break;
            case "mcp_disabled_tools":
                mcp.DisabledTools = val;
                break;
            case "mcp_enabled_domains":
                mcp.EnabledDomains = val;
                break;
            case "feature_pipeline_enabled":
                features.PipelineEnabled = ParseBool(val);
                break;
            case "feature_write_enabled":
                features.WriteEnabled = ParseBool(val);
                break;
            case "feature_pages_md_enabled":
                features.PagesMdEnabled = ParseBool(val);
                break;
            case "feature_chat_enabled":
                features.ChatEnabled = ParseBool(val);
                break;
            case "feature_mcp_visible":
                features.McpVisible = ParseBool(val);
                break;
            case "feature_secrets_visible":
                features.SecretsVisible = ParseBool(val);
                break;
        }
    }

    private static void AddMaskedSecret(JsonObject state, string key, string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return;
        }

        state[key] = ConfigSecretHelpers.Mask;
        state[$"{key}_masked"] = true;
    }

    private static void AddPlainValue(JsonObject state, string key, string value)
    {
        if (!string.IsNullOrEmpty(value))
        {
            state[key] = value;
        }
    }

    private static bool ParseBool(string value)
        => value.Trim().ToLowerInvariant() is "true" or "1" or "yes";

    private static void ApplyGooglePatch(GoogleAppSettingsPatchBuilder patch, string key, string val)
    {
        var field = SecretsKeyCatalog.GoogleFieldFromStateKey(key);
        if (field is null)
        {
            return;
        }

        switch (field)
        {
            case "client_id":
                patch.ClientId = val;
                break;
            case "client_secret":
                patch.ClientSecret = val;
                break;
            case "developer_token":
                patch.DeveloperToken = val;
                break;
            case "login_customer_id":
                patch.LoginCustomerId = val;
                break;
            case "service_account_json":
                if (string.IsNullOrWhiteSpace(val))
                {
                    break;
                }

                try
                {
                    var node = JsonNode.Parse(val) as JsonObject;
                    if (node?["type"]?.GetValue<string>() != "service_account")
                    {
                        throw new InvalidOperationException(
                            "Invalid service account JSON: expected type service_account.");
                    }

                    patch.ServiceAccountJson = node;
                }
                catch (JsonException ex)
                {
                    throw new InvalidOperationException("Invalid service account JSON.", ex);
                }

                break;
        }
    }

    private sealed class IntegrationSecretsPatchBuilder
    {
        public string? BingWebmasterApiKey { get; set; }

        public string? SerpApiKey { get; set; }

        public string? GoogleRichResultsApiKey { get; set; }

        public string? CrawlAuthPassword { get; set; }

        public string? CrawlCookies { get; set; }

        public bool HasChanges =>
            BingWebmasterApiKey is not null
            || SerpApiKey is not null
            || GoogleRichResultsApiKey is not null
            || CrawlAuthPassword is not null
            || CrawlCookies is not null;

        public IntegrationSecretsPatch Build(IntegrationSecrets current) => new()
        {
            BingWebmasterApiKey = ResolveSecret(BingWebmasterApiKey, current.BingWebmasterApiKey),
            SerpApiKey = ResolveSecret(SerpApiKey, current.SerpApiKey),
            GoogleRichResultsApiKey = ResolveSecret(GoogleRichResultsApiKey, current.GoogleRichResultsApiKey),
            CrawlAuthPassword = ResolveSecret(CrawlAuthPassword, current.CrawlAuthPassword),
            CrawlCookies = ResolveSecret(CrawlCookies, current.CrawlCookies),
        };

        private static string? ResolveSecret(string? incoming, string existing)
        {
            if (incoming is null)
            {
                return null;
            }

            if (string.IsNullOrWhiteSpace(incoming) && !string.IsNullOrWhiteSpace(existing))
            {
                return null;
            }

            return incoming;
        }
    }

    private sealed class McpSettingsPatchBuilder
    {
        public string? BearerToken { get; set; }

        public string? AllowedHosts { get; set; }

        public string? AllowedOrigins { get; set; }

        public string? PublicUrl { get; set; }

        public string? ToolBundle { get; set; }

        public string? DisabledTools { get; set; }

        public string? EnabledDomains { get; set; }

        public bool HasChanges =>
            BearerToken is not null
            || AllowedHosts is not null
            || AllowedOrigins is not null
            || PublicUrl is not null
            || ToolBundle is not null
            || DisabledTools is not null
            || EnabledDomains is not null;

        public McpSettingsPatch Build(McpSettings current) => new()
        {
            BearerToken = ResolveSecret(BearerToken, current.BearerToken),
            AllowedHosts = AllowedHosts,
            AllowedOrigins = AllowedOrigins,
            PublicUrl = PublicUrl,
            ToolBundle = ToolBundle,
            DisabledTools = DisabledTools,
            EnabledDomains = EnabledDomains,
        };

        private static string? ResolveSecret(string? incoming, string existing)
        {
            if (incoming is null)
            {
                return null;
            }

            if (string.IsNullOrWhiteSpace(incoming) && !string.IsNullOrWhiteSpace(existing))
            {
                return null;
            }

            return incoming;
        }
    }

    private sealed class FeatureFlagsPatchBuilder
    {
        public bool? PipelineEnabled { get; set; }

        public bool? WriteEnabled { get; set; }

        public bool? PagesMdEnabled { get; set; }

        public bool? ChatEnabled { get; set; }

        public bool? McpVisible { get; set; }

        public bool? SecretsVisible { get; set; }

        public bool HasChanges =>
            PipelineEnabled is not null
            || WriteEnabled is not null
            || PagesMdEnabled is not null
            || ChatEnabled is not null
            || McpVisible is not null
            || SecretsVisible is not null;

        public FeatureFlagsPatch Build() => new()
        {
            PipelineEnabled = PipelineEnabled,
            WriteEnabled = WriteEnabled,
            PagesMdEnabled = PagesMdEnabled,
            ChatEnabled = ChatEnabled,
            McpVisible = McpVisible,
            SecretsVisible = SecretsVisible,
        };
    }

    private sealed class GoogleAppSettingsPatchBuilder
    {
        public string? ClientId { get; set; }

        public string? ClientSecret { get; set; }

        public JsonObject? ServiceAccountJson { get; set; }

        public string? DeveloperToken { get; set; }

        public string? LoginCustomerId { get; set; }

        public bool HasChanges =>
            ClientId is not null
            || ClientSecret is not null
            || ServiceAccountJson is not null
            || DeveloperToken is not null
            || LoginCustomerId is not null;

        public GoogleAppSettingsPatch Build() => new()
        {
            ClientId = ClientId,
            ClientSecret = ClientSecret,
            ServiceAccountJson = ServiceAccountJson,
            DeveloperToken = DeveloperToken,
            LoginCustomerId = LoginCustomerId,
        };
    }
}
