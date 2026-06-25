using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;

namespace AiService.Tools.Context;

/// <summary>
/// Execution context for audit tools (property + report scope). Mirrors Python
/// <c>website_profiling.tools.audit_tools.context.AuditToolContext</c>.
/// </summary>
public sealed class AuditToolContext
{
    public int? PropertyId { get; init; }

    public int? ReportId { get; init; }

    /// <summary>
    /// Load the report JSON blob from <c>report_payload</c>. When <see cref="ReportId"/> is null,
    /// returns the latest report (ORDER BY id DESC LIMIT 1), matching Python <c>read_report_payload</c>.
    /// </summary>
    public async Task<JsonObject> LoadPayloadAsync(NpgsqlConnection conn, CancellationToken cancellationToken = default)
    {
        await using var cmd = conn.CreateCommand();
        if (ReportId is int reportId)
        {
            cmd.CommandText = "SELECT data FROM report_payload WHERE id = @id";
            cmd.Parameters.AddWithValue("id", reportId);
        }
        else
        {
            cmd.CommandText = "SELECT data FROM report_payload ORDER BY id DESC LIMIT 1";
        }

        var raw = await cmd.ExecuteScalarAsync(cancellationToken);
        if (raw is null or DBNull)
        {
            return [];
        }

        var text = raw switch
        {
            string s => s,
            byte[] bytes => System.Text.Encoding.UTF8.GetString(bytes),
            _ => raw.ToString() ?? "{}",
        };

        try
        {
            return JsonNode.Parse(text) as JsonObject ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>Merge tool args <c>property_id</c> / <c>report_id</c> when provided.</summary>
    public AuditToolContext WithArgs(JsonObject args)
    {
        var propertyId = PropertyId;
        var reportId = ReportId;

        if (args.TryGetPropertyValue("property_id", out var pidNode) && pidNode is not null)
        {
            if (pidNode is JsonValue pidValue && pidValue.TryGetValue(out int pidInt))
            {
                propertyId = pidInt;
            }
            else if (int.TryParse(pidNode.ToString(), out var parsedPid))
            {
                propertyId = parsedPid;
            }
        }

        if (args.TryGetPropertyValue("report_id", out var ridNode) && ridNode is not null)
        {
            if (ridNode is JsonValue ridValue && ridValue.TryGetValue(out int ridInt))
            {
                reportId = ridInt;
            }
            else if (int.TryParse(ridNode.ToString(), out var parsedRid))
            {
                reportId = parsedRid;
            }
        }

        return new AuditToolContext { PropertyId = propertyId, ReportId = reportId };
    }
}
