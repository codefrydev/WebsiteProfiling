using System.Text.Json.Nodes;
using AiService.Tools.Context;
using Npgsql;

namespace AiService.Tools.Registry;

/// <summary>Single audit tool handler — mirrors Python registry call signature.</summary>
public interface IToolHandler
{
    string ToolName { get; }

    Task<JsonObject> HandleAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken);
}
