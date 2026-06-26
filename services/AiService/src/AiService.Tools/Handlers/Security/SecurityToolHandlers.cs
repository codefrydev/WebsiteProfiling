using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using Npgsql;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Security;

/// <summary>Security findings tools — ports Python <c>security/security.py</c>.</summary>
public static class SecurityToolHandlers
{
    public static async Task<JsonObject> GetSecurityFindingsAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var severity = (JsonCoercion.AsString(args["severity"]) ?? "").Trim().ToLowerInvariant();
        return await PayloadArrayHelpers.CapPayloadArrayAsync(
            conn,
            ctx,
            args,
            "security_findings",
            "findings",
            50,
            50,
            cancellationToken,
            filter: node =>
            {
                if (string.IsNullOrEmpty(severity))
                {
                    return true;
                }

                return node is JsonObject finding
                    && string.Equals(JsonCoercion.AsString(finding["severity"]), severity, StringComparison.OrdinalIgnoreCase);
            });
    }

    public static async Task<JsonObject> GetSecurityFindingsSummaryAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(conn, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found", ["summary"] = new JsonArray(), ["total_findings"] = 0 };
        }

        var findings = payload["security_findings"] as JsonArray ?? [];
        var byType = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
        foreach (var node in findings)
        {
            if (node is not JsonObject finding)
            {
                continue;
            }

            var ftype = JsonCoercion.AsString(finding["finding_type"]) ?? "unknown";
            if (!byType.TryGetValue(ftype, out var entry))
            {
                entry = new JsonObject
                {
                    ["finding_type"] = ftype,
                    ["count"] = 0,
                    ["severities"] = new JsonObject(),
                };
                byType[ftype] = entry;
            }

            entry["count"] = (entry["count"]?.GetValue<int?>() ?? 0) + 1;
            var sev = JsonCoercion.AsString(finding["severity"]) ?? "unknown";
            if (entry["severities"] is JsonObject severities)
            {
                severities[sev] = (severities[sev]?.GetValue<int?>() ?? 0) + 1;
            }
        }

        var summary = new JsonArray(byType.Values
            .OrderByDescending(v => v["count"]?.GetValue<int?>() ?? 0)
            .Select(v => v.DeepClone())
            .ToArray());
        return new JsonObject
        {
            ["summary"] = summary,
            ["total_findings"] = findings.Count,
            ["type_count"] = byType.Count,
        };
    }

    public static async Task<JsonObject> ListSecurityFindingsByTypeAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var findingType = (JsonCoercion.AsString(args["finding_type"]) ?? "").Trim().ToLowerInvariant();
        if (findingType.Length == 0)
        {
            return new JsonObject
            {
                ["error"] = "finding_type is required",
                ["findings"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        var result = await PayloadArrayHelpers.CapPayloadArrayAsync(
            conn,
            ctx,
            args,
            "security_findings",
            "findings",
            50,
            50,
            cancellationToken,
            filter: node => node is JsonObject finding
                && string.Equals(JsonCoercion.AsString(finding["finding_type"]), findingType, StringComparison.OrdinalIgnoreCase));
        result["finding_type"] = findingType;
        return result;
    }
}
