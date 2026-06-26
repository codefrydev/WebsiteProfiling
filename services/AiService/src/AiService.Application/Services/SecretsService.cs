using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Domain.Repositories;

namespace AiService.Application.Services;

public sealed class SecretsService(
    ILlmConfigRepository llmConfig,
    IPipelineConfigRepository pipelineConfig,
    IGoogleAppSettingsRepository googleSettings)
{
    public async Task<JsonObject> GetStateAsync(CancellationToken cancellationToken = default)
    {
        var state = new JsonObject();

        var llmRows = await llmConfig.LoadFullAsync(cancellationToken);
        foreach (var row in llmRows)
        {
            var isSecret = row.IsSecret || ConfigSecretHelpers.IsSecretKey(row.Key);
            if (!isSecret)
            {
                continue;
            }

            if (string.IsNullOrEmpty(row.Value))
            {
                continue;
            }

            state[row.Key] = row.IsSecret || !string.Equals(row.Value, ConfigSecretHelpers.Mask, StringComparison.Ordinal)
                ? ConfigSecretHelpers.Mask
                : row.Value;
            if (row.IsSecret || ConfigSecretHelpers.IsSecretKey(row.Key))
            {
                state[$"{row.Key}_masked"] = true;
                if (row.UpdatedAt != default)
                {
                    state[$"{row.Key}_saved_at"] = row.UpdatedAt.UtcDateTime.ToString("O");
                }
            }
        }

        var (pipelineKnown, _) = await pipelineConfig.LoadFullAsync(cancellationToken);
        foreach (var (key, value) in pipelineKnown)
        {
            if (!SecretsKeyCatalog.IsManagedPipelineKey(key) || string.IsNullOrEmpty(value))
            {
                continue;
            }

            if (SecretsKeyCatalog.IsPipelineSecretKey(key))
            {
                state[key] = ConfigSecretHelpers.Mask;
                state[$"{key}_masked"] = true;
            }
            else
            {
                state[key] = value;
            }
        }

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
        var llmUpdates = new Dictionary<string, string>(StringComparer.Ordinal);
        var pipelineUpdates = new Dictionary<string, string>(StringComparer.Ordinal);
        var googlePatch = new GoogleAppSettingsPatchBuilder();

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
                    llmUpdates[key] = val;
                    break;
                case SecretsKeyCatalog.SecretsStorage.Pipeline:
                    pipelineUpdates[key] = val;
                    break;
                case SecretsKeyCatalog.SecretsStorage.Google:
                    ApplyGooglePatch(googlePatch, key, val);
                    break;
            }
        }

        if (llmUpdates.Count > 0)
        {
            await llmConfig.SaveAsync(llmUpdates, cancellationToken);
        }

        if (pipelineUpdates.Count > 0)
        {
            var (known, unknown) = await pipelineConfig.LoadFullAsync(cancellationToken);
            var mergedKnown = new Dictionary<string, string>(known, StringComparer.Ordinal);
            foreach (var (key, value) in pipelineUpdates)
            {
                if (SecretsKeyCatalog.IsPipelineSecretKey(key)
                    && string.IsNullOrWhiteSpace(value)
                    && known.TryGetValue(key, out var existing)
                    && !string.IsNullOrWhiteSpace(existing))
                {
                    continue;
                }

                mergedKnown[key] = value;
            }

            await pipelineConfig.SaveAsync(mergedKnown, unknown, cancellationToken);
        }

        if (googlePatch.HasChanges)
        {
            await googleSettings.MergeAsync(googlePatch.Build(), cancellationToken);
        }
    }

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
