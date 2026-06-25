using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Domain.Repositories;
using Npgsql;
using NpgsqlTypes;

namespace AiService.Application.Repositories;

public sealed class GoogleAppSettingsRepository(NpgsqlDataSource dataSource) : IGoogleAppSettingsRepository
{
    private const int SingletonId = 1;

    public async Task<GoogleAppSettings> LoadAsync(CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            SELECT client_id, client_secret, service_account_json,
                   default_date_range_days, developer_token, login_customer_id
            FROM google_app_settings WHERE id = $1
            """,
            conn);
        cmd.Parameters.AddWithValue(SingletonId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);

        if (!await reader.ReadAsync(cancellationToken))
        {
            return new GoogleAppSettings();
        }

        return new GoogleAppSettings
        {
            ClientId = reader.IsDBNull(0) ? "" : reader.GetString(0).Trim(),
            ClientSecret = reader.IsDBNull(1) ? "" : reader.GetString(1).Trim(),
            ServiceAccountJson = ParseServiceAccountJson(reader, 2),
            DefaultDateRangeDays = reader.IsDBNull(3) ? 28 : reader.GetInt32(3),
            DeveloperToken = reader.IsDBNull(4) ? "" : (reader.GetString(4) ?? "").Trim(),
            LoginCustomerId = reader.IsDBNull(5) ? "" : (reader.GetString(5) ?? "").Trim(),
        };
    }

    public async Task MergeAsync(GoogleAppSettingsPatch patch, CancellationToken cancellationToken = default)
    {
        var sets = new List<string> { "updated_at = now()" };
        var cmd = new NpgsqlCommand();
        var paramIndex = 1;

        if (patch.ClientId is not null)
        {
            sets.Add($"client_id = ${paramIndex++}");
            cmd.Parameters.AddWithValue(patch.ClientId);
        }

        if (patch.ClientSecret is not null)
        {
            sets.Add($"client_secret = ${paramIndex++}");
            cmd.Parameters.AddWithValue(patch.ClientSecret);
        }

        if (patch.ServiceAccountJson is not null)
        {
            sets.Add($"service_account_json = ${paramIndex++}");
            cmd.Parameters.Add(new NpgsqlParameter
            {
                Value = patch.ServiceAccountJson,
                NpgsqlDbType = NpgsqlDbType.Jsonb,
            });
        }

        if (patch.DefaultDateRangeDays is not null)
        {
            sets.Add($"default_date_range_days = ${paramIndex++}");
            cmd.Parameters.AddWithValue(patch.DefaultDateRangeDays.Value);
        }

        if (patch.DeveloperToken is not null)
        {
            sets.Add($"developer_token = ${paramIndex++}");
            cmd.Parameters.AddWithValue(
                string.IsNullOrWhiteSpace(patch.DeveloperToken) ? DBNull.Value : patch.DeveloperToken);
        }

        if (patch.LoginCustomerId is not null)
        {
            sets.Add($"login_customer_id = ${paramIndex++}");
            cmd.Parameters.AddWithValue(
                string.IsNullOrWhiteSpace(patch.LoginCustomerId) ? DBNull.Value : patch.LoginCustomerId);
        }

        if (cmd.Parameters.Count == 0)
        {
            return;
        }

        cmd.Parameters.AddWithValue(SingletonId);
        cmd.CommandText = $"UPDATE google_app_settings SET {string.Join(", ", sets)} WHERE id = ${paramIndex}";

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        cmd.Connection = conn;
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static JsonObject? ParseServiceAccountJson(NpgsqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        if (reader.GetFieldType(ordinal) == typeof(string))
        {
            var raw = reader.GetString(ordinal);
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            try
            {
                return JsonNode.Parse(raw) as JsonObject;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        try
        {
            var obj = reader.GetFieldValue<JsonObject>(ordinal);
            return obj;
        }
        catch
        {
            return null;
        }
    }
}
