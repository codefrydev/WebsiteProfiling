using System.Diagnostics;
using System.Text.Json.Nodes;
using AiService.Tools.Bridge;
using AiService.Tools.Context;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace AiService.Tools.Registry;

/// <summary>
/// Dispatches a tool call using a pooled Postgres connection. Native C# handlers take
/// precedence; unported tools fall back to the Python FastAPI audit-tool bridge.
/// </summary>
public sealed class ToolDispatcher(
    NpgsqlDataSource dataSource,
    ToolRegistry registry,
    PythonToolBridgeClient pythonBridge,
    ILogger<ToolDispatcher> logger)
{
    public async Task<JsonObject> DispatchAsync(
        string toolName,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken = default)
    {
        if (registry.TryGet(toolName, out var handler) && handler is not null)
        {
            var sw = Stopwatch.StartNew();
            await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
            var result = await handler.HandleAsync(conn, ctx, args, cancellationToken);
            sw.Stop();
            logger.LogDebug(
                "Audit tool {ToolName} dispatched via native handler in {ElapsedMs}ms",
                toolName,
                sw.ElapsedMilliseconds);
            return result;
        }

        if (ctx.PropertyId is not int propertyId)
        {
            return new JsonObject { ["error"] = "property_id required" };
        }

        var bridgeSw = Stopwatch.StartNew();
        var bridgeResult = await pythonBridge.InvokeAsync(toolName, args, propertyId, ctx.ReportId, cancellationToken);
        bridgeSw.Stop();
        logger.LogInformation(
            "Audit tool {ToolName} dispatched via python_bridge in {ElapsedMs}ms",
            toolName,
            bridgeSw.ElapsedMilliseconds);
        return bridgeResult;
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
