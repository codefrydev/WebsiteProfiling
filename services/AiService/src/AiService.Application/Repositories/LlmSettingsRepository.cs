using AiService.Domain.Models;
using AiService.Domain.Repositories;
using Npgsql;

namespace AiService.Application.Repositories;

public sealed class LlmSettingsRepository(NpgsqlDataSource dataSource) : ILlmSettingsRepository
{
    private const int SingletonId = 1;

    public async Task<LlmSettings> LoadAsync(CancellationToken cancellationToken = default)
        => await LoadInternalAsync(maskSecrets: false, cancellationToken);

    public async Task<LlmSettings> LoadForClientAsync(CancellationToken cancellationToken = default)
        => await LoadInternalAsync(maskSecrets: true, cancellationToken);

    public async Task MergeAsync(LlmSettingsPatch patch, CancellationToken cancellationToken = default)
    {
        var sets = new List<string> { "updated_at = now()" };
        var cmd = new NpgsqlCommand();
        var paramIndex = 1;

        AddBool(patch.Enabled, "enabled", sets, cmd, ref paramIndex);
        AddText(patch.Provider, "provider", sets, cmd, ref paramIndex);
        AddText(patch.ActiveModel, "active_model", sets, cmd, ref paramIndex);
        AddText(patch.OllamaBaseUrl, "ollama_base_url", sets, cmd, ref paramIndex);
        AddBool(patch.EnableNer, "enable_ner", sets, cmd, ref paramIndex);
        AddBool(patch.EnableKeyphrases, "enable_keyphrases", sets, cmd, ref paramIndex);
        AddBool(patch.EnableSimilarInternal, "enable_similar_internal", sets, cmd, ref paramIndex);
        AddBool(patch.EnableKeywordClusters, "enable_keyword_clusters", sets, cmd, ref paramIndex);
        AddBool(patch.EnableIssueFixes, "enable_issue_fixes", sets, cmd, ref paramIndex);
        AddBool(patch.EnableAuditSummary, "enable_audit_summary", sets, cmd, ref paramIndex);
        AddBool(patch.EnablePageCoach, "enable_page_coach", sets, cmd, ref paramIndex);
        AddBool(patch.EnableContentStudio, "enable_content_studio", sets, cmd, ref paramIndex);
        AddBool(patch.EnableDashboards, "enable_dashboards", sets, cmd, ref paramIndex);
        AddText(patch.ChatAssistantName, "chat_assistant_name", sets, cmd, ref paramIndex);
        AddText(patch.ChatAssistantAvatarUrl, "chat_assistant_avatar_url", sets, cmd, ref paramIndex);
        AddBool(patch.ChatUnlimitedToolRounds, "chat_unlimited_tool_rounds", sets, cmd, ref paramIndex);
        AddBool(patch.ChatAllowCrawl, "chat_allow_crawl", sets, cmd, ref paramIndex);
        AddBool(patch.ChatFastNarrative, "chat_fast_narrative", sets, cmd, ref paramIndex);
        AddInt(patch.MaxPages, "max_pages", sets, cmd, ref paramIndex);
        AddInt(patch.BatchSize, "batch_size", sets, cmd, ref paramIndex);
        AddInt(patch.Concurrency, "concurrency", sets, cmd, ref paramIndex);
        AddInt(patch.TimeoutSeconds, "timeout_seconds", sets, cmd, ref paramIndex);
        AddInt(patch.SimilarTopK, "similar_top_k", sets, cmd, ref paramIndex);

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);

        if (cmd.Parameters.Count > 0)
        {
            cmd.Parameters.AddWithValue(SingletonId);
            cmd.CommandText = $"UPDATE llm_settings SET {string.Join(", ", sets)} WHERE id = ${paramIndex}";
            cmd.Connection = conn;
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }

        if (patch.ProviderProfiles is { Count: > 0 })
        {
            foreach (var profile in patch.ProviderProfiles)
            {
                if (profile.SavedModel is null)
                {
                    continue;
                }

                await using var upsert = new NpgsqlCommand(
                    """
                    INSERT INTO llm_provider_profiles (provider, saved_model)
                    VALUES ($1, $2)
                    ON CONFLICT (provider) DO UPDATE SET saved_model = EXCLUDED.saved_model
                    """,
                    conn);
                upsert.Parameters.AddWithValue(profile.Provider);
                upsert.Parameters.AddWithValue(profile.SavedModel);
                await upsert.ExecuteNonQueryAsync(cancellationToken);
            }
        }
    }

    public async Task MergeProviderApiKeyAsync(
        string provider,
        string? apiKey,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(provider))
        {
            return;
        }

        var normalizedProvider = provider.Trim().ToLowerInvariant();
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);

        var existingKey = "";
        await using (var read = new NpgsqlCommand(
                         "SELECT api_key FROM llm_provider_profiles WHERE provider = $1",
                         conn))
        {
            read.Parameters.AddWithValue(normalizedProvider);
            var scalar = await read.ExecuteScalarAsync(cancellationToken);
            existingKey = scalar is string s ? s : "";
        }

        if (LlmSettingsSecretMask.IsMaskedSentinel(apiKey))
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(apiKey)
            && !string.IsNullOrWhiteSpace(existingKey))
        {
            return;
        }

        var value = apiKey ?? "";
        var touchTimestamp = !string.Equals(existingKey, value, StringComparison.Ordinal);

        await using var upsert = new NpgsqlCommand(
            """
            INSERT INTO llm_provider_profiles (provider, api_key, api_key_updated_at)
            VALUES ($1, $2, CASE WHEN $3 THEN now() ELSE NULL END)
            ON CONFLICT (provider) DO UPDATE SET
                api_key = EXCLUDED.api_key,
                api_key_updated_at = CASE
                    WHEN $3 THEN now()
                    ELSE llm_provider_profiles.api_key_updated_at
                END
            """,
            conn);
        upsert.Parameters.AddWithValue(normalizedProvider);
        upsert.Parameters.AddWithValue(value);
        upsert.Parameters.AddWithValue(touchTimestamp);
        await upsert.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task<LlmSettings> LoadInternalAsync(bool maskSecrets, CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);

        LlmSettings? settings = null;
        {
            await using var cmd = new NpgsqlCommand(
                """
                SELECT enabled, provider, active_model, ollama_base_url,
                       enable_ner, enable_keyphrases, enable_similar_internal, enable_keyword_clusters,
                       enable_issue_fixes, enable_audit_summary, enable_page_coach, enable_content_studio,
                       enable_dashboards, chat_assistant_name, chat_assistant_avatar_url,
                       chat_unlimited_tool_rounds, chat_allow_crawl, chat_fast_narrative,
                       max_pages, batch_size, concurrency, timeout_seconds, similar_top_k, updated_at
                FROM llm_settings WHERE id = $1
                """,
                conn);
            cmd.Parameters.AddWithValue(SingletonId);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                settings = new LlmSettings
                {
                    Enabled = reader.GetBoolean(0),
                    Provider = reader.GetString(1).Trim(),
                    ActiveModel = reader.GetString(2).Trim(),
                    OllamaBaseUrl = reader.GetString(3).Trim(),
                    EnableNer = reader.GetBoolean(4),
                    EnableKeyphrases = reader.GetBoolean(5),
                    EnableSimilarInternal = reader.GetBoolean(6),
                    EnableKeywordClusters = reader.GetBoolean(7),
                    EnableIssueFixes = reader.GetBoolean(8),
                    EnableAuditSummary = reader.GetBoolean(9),
                    EnablePageCoach = reader.GetBoolean(10),
                    EnableContentStudio = reader.GetBoolean(11),
                    EnableDashboards = reader.GetBoolean(12),
                    ChatAssistantName = reader.GetString(13).Trim(),
                    ChatAssistantAvatarUrl = reader.GetString(14).Trim(),
                    ChatUnlimitedToolRounds = reader.GetBoolean(15),
                    ChatAllowCrawl = reader.GetBoolean(16),
                    ChatFastNarrative = reader.GetBoolean(17),
                    MaxPages = reader.GetInt32(18),
                    BatchSize = reader.GetInt32(19),
                    Concurrency = reader.GetInt32(20),
                    TimeoutSeconds = reader.GetInt32(21),
                    SimilarTopK = reader.GetInt32(22),
                    UpdatedAt = reader.GetFieldValue<DateTimeOffset>(23),
                };
            }
        }

        var providerProfiles = await LoadProvidersAsync(conn, maskSecrets, cancellationToken);
        if (settings is null)
        {
            return new LlmSettings { Providers = providerProfiles };
        }

        return new LlmSettings
        {
            Enabled = settings.Enabled,
            Provider = settings.Provider,
            ActiveModel = settings.ActiveModel,
            OllamaBaseUrl = settings.OllamaBaseUrl,
            EnableNer = settings.EnableNer,
            EnableKeyphrases = settings.EnableKeyphrases,
            EnableSimilarInternal = settings.EnableSimilarInternal,
            EnableKeywordClusters = settings.EnableKeywordClusters,
            EnableIssueFixes = settings.EnableIssueFixes,
            EnableAuditSummary = settings.EnableAuditSummary,
            EnablePageCoach = settings.EnablePageCoach,
            EnableContentStudio = settings.EnableContentStudio,
            EnableDashboards = settings.EnableDashboards,
            ChatAssistantName = settings.ChatAssistantName,
            ChatAssistantAvatarUrl = settings.ChatAssistantAvatarUrl,
            ChatUnlimitedToolRounds = settings.ChatUnlimitedToolRounds,
            ChatAllowCrawl = settings.ChatAllowCrawl,
            ChatFastNarrative = settings.ChatFastNarrative,
            MaxPages = settings.MaxPages,
            BatchSize = settings.BatchSize,
            Concurrency = settings.Concurrency,
            TimeoutSeconds = settings.TimeoutSeconds,
            SimilarTopK = settings.SimilarTopK,
            UpdatedAt = settings.UpdatedAt,
            Providers = providerProfiles,
        };
    }

    private static async Task<IReadOnlyList<LlmProviderProfile>> LoadProvidersAsync(
        NpgsqlConnection conn,
        bool maskSecrets,
        CancellationToken cancellationToken)
    {
        var profiles = new List<LlmProviderProfile>();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT provider, api_key, saved_model, api_key_updated_at
            FROM llm_provider_profiles
            ORDER BY provider
            """,
            conn);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var apiKey = reader.IsDBNull(1) ? "" : reader.GetString(1);
            profiles.Add(new LlmProviderProfile
            {
                Provider = reader.GetString(0).Trim(),
                ApiKey = maskSecrets ? LlmSettingsSecretMask.MaskApiKey(apiKey) : apiKey,
                SavedModel = reader.IsDBNull(2) ? "" : reader.GetString(2).Trim(),
                ApiKeyUpdatedAt = reader.IsDBNull(3) ? null : reader.GetFieldValue<DateTimeOffset>(3),
            });
        }

        return profiles;
    }

    private static void AddBool(bool? value, string column, List<string> sets, NpgsqlCommand cmd, ref int paramIndex)
    {
        if (value is null)
        {
            return;
        }

        sets.Add($"{column} = ${paramIndex++}");
        cmd.Parameters.AddWithValue(value.Value);
    }

    private static void AddInt(int? value, string column, List<string> sets, NpgsqlCommand cmd, ref int paramIndex)
    {
        if (value is null)
        {
            return;
        }

        sets.Add($"{column} = ${paramIndex++}");
        cmd.Parameters.AddWithValue(value.Value);
    }

    private static void AddText(string? value, string column, List<string> sets, NpgsqlCommand cmd, ref int paramIndex)
    {
        if (value is null)
        {
            return;
        }

        sets.Add($"{column} = ${paramIndex++}");
        cmd.Parameters.AddWithValue(value);
    }
}
