using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Persistence;

namespace AiService.Tools.Registry;

/// <summary>Single audit tool handler — mirrors Python registry call signature.</summary>
public interface IToolHandler
{
    string ToolName { get; }

    Task<JsonObject> HandleAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken);
}
