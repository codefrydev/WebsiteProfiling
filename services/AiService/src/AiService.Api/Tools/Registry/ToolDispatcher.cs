using System.Diagnostics;
using System.Text.Json.Nodes;
using AiService.Api.Tools.Bridge;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Api.Tools.Registry;

/// <summary>
/// Dispatches a tool call using EF Core. Native C# handlers take precedence;
/// unported tools fall back to the Python FastAPI audit-tool bridge.
/// </summary>
public sealed class ToolDispatcher(
    IDbContextFactory<AuditToolsDbContext> dbFactory,
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
            await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
            if (ctx.Logger is null)
            {
                ctx = new AuditToolContext
                {
                    PropertyId = ctx.PropertyId,
                    ReportId = ctx.ReportId,
                    Logger = logger,
                };
            }
            var result = await handler.HandleAsync(db, ctx, args, cancellationToken);
            sw.Stop();
            logger.LogDebug(
                "Audit tool {ToolName} dispatched via native handler in {ElapsedMs}ms",
                toolName,
                sw.ElapsedMilliseconds);
            return result;
        }

        if (ctx.PropertyId is not long propertyId)
        {
            return new JsonObject { ["error"] = "property_id required" };
        }

        var bridgeSw = Stopwatch.StartNew();
        PythonBridgeMetrics.RecordBridgeDispatch();
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
        long propertyId,
        long? reportId,
        JsonObject args,
        CancellationToken cancellationToken = default)
    {
        var ctx = new AuditToolContext { PropertyId = propertyId, ReportId = reportId };
        return await DispatchAsync(toolName, ctx, args, cancellationToken);
    }
}
