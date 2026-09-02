using System.Text.Json.Nodes;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Registry;
using Microsoft.Extensions.AI;

namespace AiService.Api.Application.Chat;

/// <summary>Builds MEAI <see cref="AIFunction"/> tools from the audit catalog for a chat turn.</summary>
public sealed class AuditChatToolsBuilder(ToolCatalog toolCatalog, ToolDispatcher toolDispatcher)
{
    public IReadOnlyList<AIFunction> Build(
        AuditToolContext context,
        IReadOnlySet<string> selectedTools,
        ChatTurnProgress progress)
    {
        var tools = new List<AIFunction>();
        foreach (var definition in toolCatalog.ToolDefinitions)
        {
            var fn = definition["function"] as JsonObject;
            var toolName = fn?["name"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(toolName) || !selectedTools.Contains(toolName))
            {
                continue;
            }

            var description = fn?["description"]?.GetValue<string>() ?? toolName;
            var capturedName = toolName;
            tools.Add(AIFunctionFactory.Create(
                async (AIFunctionArguments args, CancellationToken ct) =>
                {
                    var callId = Guid.NewGuid().ToString("N");
                    var outcome = await progress.DispatchToolAsync(
                        callId,
                        capturedName,
                        args,
                        context,
                        toolDispatcher,
                        ct);
                    return ToolResultCompactor.CompactForLlm(capturedName, outcome.ResultObject).ToJsonString();
                },
                capturedName,
                description));
        }

        return tools;
    }
}
