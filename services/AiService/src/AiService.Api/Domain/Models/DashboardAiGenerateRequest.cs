using System.Text.Json.Nodes;

namespace AiService.Api.Domain.Models;

public sealed class DashboardAiGenerateRequest
{
    public string Mode { get; init; } = "widget";

    public string Prompt { get; init; } = "";

    public string? ToolName { get; init; }

    public long? PropertyId { get; init; }

    public long? ReportId { get; init; }

    /// <summary>Current widget binding / options, passed as context for script mode.</summary>
    public JsonObject? Current { get; init; }

    public JsonObject ToJsonObject()
    {
        var payload = new JsonObject
        {
            ["mode"] = Mode,
            ["prompt"] = Prompt,
        };

        if (ToolName is not null) payload["toolName"] = ToolName;
        if (PropertyId is not null) payload["propertyId"] = PropertyId.Value;
        if (ReportId is not null) payload["reportId"] = ReportId.Value;
        if (Current is not null) payload["current"] = Current.DeepClone();

        return payload;
    }
}
