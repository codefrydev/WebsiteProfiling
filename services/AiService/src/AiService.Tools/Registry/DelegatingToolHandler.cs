using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Persistence;

namespace AiService.Tools.Registry;

public sealed class DelegatingToolHandler(
    string toolName,
    Func<AuditToolsDbContext, AuditToolContext, JsonObject, CancellationToken, Task<JsonObject>> handle) : IToolHandler
{
    public string ToolName { get; } = toolName;

    public Task<JsonObject> HandleAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => handle(db, ctx, args, cancellationToken);
}
