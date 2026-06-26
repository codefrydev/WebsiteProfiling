using System.Text.Json.Nodes;
using AiService.Tools.Context;
using Npgsql;

namespace AiService.Tools.Registry;

public sealed class DelegatingToolHandler(
    string toolName,
    Func<NpgsqlConnection, AuditToolContext, JsonObject, CancellationToken, Task<JsonObject>> handle) : IToolHandler
{
    public string ToolName { get; } = toolName;

    public Task<JsonObject> HandleAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => handle(conn, ctx, args, cancellationToken);
}
