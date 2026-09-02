using System.Text.Json.Nodes;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Persistence;

namespace AiService.Api.Tools.Registry;

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
