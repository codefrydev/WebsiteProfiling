using System.Globalization;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

namespace CoreService.Api.Application.Dashboard;

public sealed class DashboardRepository(NpgsqlDataSource dataSource)
{
    private const string SelectColumns = """
        id, property_id, name, layout_json, is_default, created_at, updated_at
        """;

    public async Task<IReadOnlyList<Dictionary<string, object?>>> ListAsync(
        long propertyId,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"""
             SELECT {SelectColumns}
             FROM dashboards
             WHERE property_id = @propertyId
             ORDER BY updated_at DESC
             """,
            conn);
        cmd.Parameters.AddWithValue("propertyId", propertyId);
        return await ReadAllAsync(cmd, cancellationToken);
    }

    public async Task<Dictionary<string, object?>?> GetAsync(
        long dashboardId,
        long propertyId,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"""
             SELECT {SelectColumns}
             FROM dashboards
             WHERE id = @id AND property_id = @propertyId
             """,
            conn);
        cmd.Parameters.AddWithValue("id", dashboardId);
        cmd.Parameters.AddWithValue("propertyId", propertyId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRow(reader) : null;
    }

    public async Task<Dictionary<string, object?>> CreateAsync(
        long propertyId,
        string name,
        JsonElement layoutJson,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"""
             INSERT INTO dashboards (property_id, name, layout_json)
             VALUES (@propertyId, @name, @layoutJson)
             RETURNING {SelectColumns}
             """,
            conn);
        cmd.Parameters.AddWithValue("propertyId", propertyId);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.Add(new NpgsqlParameter("layoutJson", NpgsqlDbType.Jsonb)
        {
            Value = layoutJson.ValueKind == JsonValueKind.Undefined ? "{}" : layoutJson.GetRawText(),
        });
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return MapRow(reader);
    }

    public async Task<Dictionary<string, object?>?> UpdateAsync(
        long dashboardId,
        long propertyId,
        string? name,
        JsonElement? layoutJson,
        bool? isDefault,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        if (isDefault == true)
        {
            await using var clear = new NpgsqlCommand(
                "UPDATE dashboards SET is_default = false WHERE property_id = @propertyId",
                conn);
            clear.Parameters.AddWithValue("propertyId", propertyId);
            await clear.ExecuteNonQueryAsync(cancellationToken);
        }

        var sets = new List<string> { "updated_at = now()" };
        var parameters = new List<NpgsqlParameter>
        {
            new("id", dashboardId),
            new("propertyId", propertyId),
        };

        if (name is not null)
        {
            sets.Add("name = @name");
            parameters.Add(new NpgsqlParameter("name", string.IsNullOrWhiteSpace(name) ? "Untitled dashboard" : name.Trim()));
        }

        if (layoutJson is not null)
        {
            sets.Add("layout_json = @layoutJson");
            parameters.Add(new NpgsqlParameter("layoutJson", NpgsqlDbType.Jsonb)
            {
                Value = layoutJson.Value.ValueKind == JsonValueKind.Undefined
                    ? "{}"
                    : layoutJson.Value.GetRawText(),
            });
        }

        if (isDefault is not null)
        {
            sets.Add("is_default = @isDefault");
            parameters.Add(new NpgsqlParameter("isDefault", isDefault.Value));
        }

        await using var cmd = new NpgsqlCommand(
            $"""
             UPDATE dashboards SET {string.Join(", ", sets)}
             WHERE id = @id AND property_id = @propertyId
             RETURNING {SelectColumns}
             """,
            conn);
        cmd.Parameters.AddRange(parameters.ToArray());
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRow(reader) : null;
    }

    public async Task<bool> DeleteAsync(
        long dashboardId,
        long propertyId,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "DELETE FROM dashboards WHERE id = @id AND property_id = @propertyId RETURNING id",
            conn);
        cmd.Parameters.AddWithValue("id", dashboardId);
        cmd.Parameters.AddWithValue("propertyId", propertyId);
        return await cmd.ExecuteScalarAsync(cancellationToken) is not null;
    }

    private static async Task<IReadOnlyList<Dictionary<string, object?>>> ReadAllAsync(
        NpgsqlCommand cmd,
        CancellationToken cancellationToken)
    {
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        var list = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(MapRow(reader));
        }

        return list;
    }

    private static Dictionary<string, object?> MapRow(NpgsqlDataReader reader)
    {
        object? layout = new { };
        if (!reader.IsDBNull(3))
        {
            try
            {
                layout = JsonSerializer.Deserialize<object>(reader.GetFieldValue<string>(3));
            }
            catch (JsonException)
            {
                layout = new { };
            }
        }

        return new Dictionary<string, object?>
        {
            ["id"] = reader.GetInt64(0),
            ["propertyId"] = reader.GetInt64(1),
            ["name"] = reader.IsDBNull(2) ? null : reader.GetString(2),
            ["layoutJson"] = layout,
            ["isDefault"] = !reader.IsDBNull(4) && reader.GetBoolean(4),
            ["createdAt"] = FormatIso(reader, 5),
            ["updatedAt"] = FormatIso(reader, 6),
        };
    }

    private static string FormatIso(NpgsqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return "";
        }

        var utc = reader.GetFieldValue<DateTimeOffset>(ordinal).ToUniversalTime();
        var basePart = utc.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
        var microseconds = (utc.Ticks % TimeSpan.TicksPerSecond) / 10;
        var frac = microseconds == 0
            ? string.Empty
            : "." + microseconds.ToString("D6", CultureInfo.InvariantCulture);
        return $"{basePart}{frac}+00:00";
    }
}
