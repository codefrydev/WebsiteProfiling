using AiService.Domain.Models;
using AiService.Domain.Repositories;
using Npgsql;

namespace AiService.Application.Repositories;

public sealed class IntegrationSecretsRepository(NpgsqlDataSource dataSource) : IIntegrationSecretsRepository
{
    private const int SingletonId = 1;

    public async Task<IntegrationSecrets> LoadAsync(CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            SELECT bing_webmaster_api_key, serp_api_key, google_rich_results_api_key,
                   crawl_auth_password, crawl_cookies
            FROM integration_secrets WHERE id = $1
            """,
            conn);
        cmd.Parameters.AddWithValue(SingletonId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new IntegrationSecrets();
        }

        return new IntegrationSecrets
        {
            BingWebmasterApiKey = ReadText(reader, 0),
            SerpApiKey = ReadText(reader, 1),
            GoogleRichResultsApiKey = ReadText(reader, 2),
            CrawlAuthPassword = ReadText(reader, 3),
            CrawlCookies = ReadText(reader, 4),
        };
    }

    public async Task MergeAsync(IntegrationSecretsPatch patch, CancellationToken cancellationToken = default)
    {
        var sets = new List<string> { "updated_at = now()" };
        var cmd = new NpgsqlCommand();
        var paramIndex = 1;
        AddText(patch.BingWebmasterApiKey, "bing_webmaster_api_key", sets, cmd, ref paramIndex);
        AddText(patch.SerpApiKey, "serp_api_key", sets, cmd, ref paramIndex);
        AddText(patch.GoogleRichResultsApiKey, "google_rich_results_api_key", sets, cmd, ref paramIndex);
        AddText(patch.CrawlAuthPassword, "crawl_auth_password", sets, cmd, ref paramIndex);
        AddText(patch.CrawlCookies, "crawl_cookies", sets, cmd, ref paramIndex);
        if (cmd.Parameters.Count == 0)
        {
            return;
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        cmd.Parameters.AddWithValue(SingletonId);
        cmd.CommandText = $"UPDATE integration_secrets SET {string.Join(", ", sets)} WHERE id = ${paramIndex}";
        cmd.Connection = conn;
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string ReadText(NpgsqlDataReader reader, int ordinal)
        => reader.IsDBNull(ordinal) ? "" : reader.GetString(ordinal);

    private static void AddText(string? value, string column, List<string> sets, NpgsqlCommand cmd, ref int paramIndex)
    {
        if (value is null)
        {
            return;
        }

        sets.Add($"{column} = ${paramIndex}");
        cmd.Parameters.AddWithValue(value);
        paramIndex++;
    }
}

public sealed class McpSettingsRepository(NpgsqlDataSource dataSource) : IMcpSettingsRepository
{
    private const int SingletonId = 1;

    public async Task<McpSettings> LoadAsync(CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            SELECT bearer_token, allowed_hosts, allowed_origins, public_url,
                   tool_bundle, disabled_tools, enabled_domains
            FROM mcp_settings WHERE id = $1
            """,
            conn);
        cmd.Parameters.AddWithValue(SingletonId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new McpSettings();
        }

        return new McpSettings
        {
            BearerToken = ReadText(reader, 0),
            AllowedHosts = ReadText(reader, 1),
            AllowedOrigins = ReadText(reader, 2),
            PublicUrl = ReadText(reader, 3),
            ToolBundle = string.IsNullOrWhiteSpace(ReadText(reader, 4)) ? "core" : ReadText(reader, 4),
            DisabledTools = ReadText(reader, 5),
            EnabledDomains = string.IsNullOrWhiteSpace(ReadText(reader, 6))
                ? "[\"core\",\"insight\"]"
                : ReadText(reader, 6),
        };
    }

    public async Task MergeAsync(McpSettingsPatch patch, CancellationToken cancellationToken = default)
    {
        var sets = new List<string> { "updated_at = now()" };
        var cmd = new NpgsqlCommand();
        var paramIndex = 1;
        AddText(patch.BearerToken, "bearer_token", sets, cmd, ref paramIndex);
        AddText(patch.AllowedHosts, "allowed_hosts", sets, cmd, ref paramIndex);
        AddText(patch.AllowedOrigins, "allowed_origins", sets, cmd, ref paramIndex);
        AddText(patch.PublicUrl, "public_url", sets, cmd, ref paramIndex);
        AddText(patch.ToolBundle, "tool_bundle", sets, cmd, ref paramIndex);
        AddText(patch.DisabledTools, "disabled_tools", sets, cmd, ref paramIndex);
        AddText(patch.EnabledDomains, "enabled_domains", sets, cmd, ref paramIndex);
        if (cmd.Parameters.Count == 0)
        {
            return;
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        cmd.Parameters.AddWithValue(SingletonId);
        cmd.CommandText = $"UPDATE mcp_settings SET {string.Join(", ", sets)} WHERE id = ${paramIndex}";
        cmd.Connection = conn;
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string ReadText(NpgsqlDataReader reader, int ordinal)
        => reader.IsDBNull(ordinal) ? "" : reader.GetString(ordinal);

    private static void AddText(string? value, string column, List<string> sets, NpgsqlCommand cmd, ref int paramIndex)
    {
        if (value is null)
        {
            return;
        }

        sets.Add($"{column} = ${paramIndex}");
        cmd.Parameters.AddWithValue(value);
        paramIndex++;
    }
}

public sealed class FeatureFlagsRepository(NpgsqlDataSource dataSource) : IFeatureFlagsRepository
{
    private const int SingletonId = 1;

    public async Task<FeatureFlags> LoadAsync(CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            SELECT pipeline_enabled, write_enabled, pages_md_enabled,
                   chat_enabled, mcp_visible, secrets_visible
            FROM feature_flags WHERE id = $1
            """,
            conn);
        cmd.Parameters.AddWithValue(SingletonId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new FeatureFlags();
        }

        return new FeatureFlags
        {
            PipelineEnabled = ReadBool(reader, 0, defaultValue: true),
            WriteEnabled = ReadBool(reader, 1, defaultValue: true),
            PagesMdEnabled = ReadBool(reader, 2, defaultValue: true),
            ChatEnabled = ReadBool(reader, 3, defaultValue: true),
            McpVisible = ReadBool(reader, 4, defaultValue: true),
            SecretsVisible = ReadBool(reader, 5, defaultValue: true),
        };
    }

    public async Task MergeAsync(FeatureFlagsPatch patch, CancellationToken cancellationToken = default)
    {
        var sets = new List<string> { "updated_at = now()" };
        var cmd = new NpgsqlCommand();
        var paramIndex = 1;
        AddBool(patch.PipelineEnabled, "pipeline_enabled", sets, cmd, ref paramIndex);
        AddBool(patch.WriteEnabled, "write_enabled", sets, cmd, ref paramIndex);
        AddBool(patch.PagesMdEnabled, "pages_md_enabled", sets, cmd, ref paramIndex);
        AddBool(patch.ChatEnabled, "chat_enabled", sets, cmd, ref paramIndex);
        AddBool(patch.McpVisible, "mcp_visible", sets, cmd, ref paramIndex);
        AddBool(patch.SecretsVisible, "secrets_visible", sets, cmd, ref paramIndex);
        if (cmd.Parameters.Count == 0)
        {
            return;
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        cmd.Parameters.AddWithValue(SingletonId);
        cmd.CommandText = $"UPDATE feature_flags SET {string.Join(", ", sets)} WHERE id = ${paramIndex}";
        cmd.Connection = conn;
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static bool ReadBool(NpgsqlDataReader reader, int ordinal, bool defaultValue)
        => reader.IsDBNull(ordinal) ? defaultValue : reader.GetBoolean(ordinal);

    private static void AddBool(bool? value, string column, List<string> sets, NpgsqlCommand cmd, ref int paramIndex)
    {
        if (value is null)
        {
            return;
        }

        sets.Add($"{column} = ${paramIndex}");
        cmd.Parameters.AddWithValue(value.Value);
        paramIndex++;
    }
}
