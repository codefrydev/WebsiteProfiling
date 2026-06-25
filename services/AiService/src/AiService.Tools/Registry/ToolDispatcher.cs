using System.Text.Json.Nodes;
using AiService.Tools.Bridge;
using AiService.Tools.Context;
using Npgsql;

namespace AiService.Tools.Registry;

/// <summary>
/// Dispatches a tool call using a pooled Postgres connection. Native C# handlers take
/// precedence; unported tools fall back to the Python FastAPI audit-tool bridge.
/// </summary>
public sealed class ToolDispatcher(
    NpgsqlDataSource dataSource,
    ToolRegistry registry,
    PythonToolBridgeClient pythonBridge)
{
    public async Task<JsonObject> DispatchAsync(
        string toolName,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken = default)
    {
        if (registry.TryGet(toolName, out var handler) && handler is not null)
        {
            await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
            return await handler.HandleAsync(conn, ctx, args, cancellationToken);
        }

        if (ctx.PropertyId is not int propertyId)
        {
            return new JsonObject { ["error"] = "property_id required" };
        }

        return await pythonBridge.InvokeAsync(toolName, args, propertyId, ctx.ReportId, cancellationToken);
    }

    public async Task<JsonObject> DispatchAsync(
        string toolName,
        int propertyId,
        int? reportId,
        JsonObject args,
        CancellationToken cancellationToken = default)
    {
        var ctx = new AuditToolContext { PropertyId = propertyId, ReportId = reportId };
        return await DispatchAsync(toolName, ctx, args, cancellationToken);
    }
}
