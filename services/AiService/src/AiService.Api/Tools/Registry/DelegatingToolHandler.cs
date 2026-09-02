using System.Text.Json.Nodes;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Persistence;

namespace AiService.Api.Tools.Registry;

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
