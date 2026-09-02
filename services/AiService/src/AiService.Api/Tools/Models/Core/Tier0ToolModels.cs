using System.Text.Json.Serialization;

namespace AiService.Api.Tools.Models.Core;

/// <summary>Args for Tier-0 router/SQL tools (batch 3 migration).</summary>
public sealed record RunSqlQueryArgs
{
    [JsonPropertyName("query")]
    public string Query { get; init; } = "";

    [JsonPropertyName("limit")]
    public int? Limit { get; init; }
}

public sealed record SearchAuditToolsArgs
{
    [JsonPropertyName("query")]
    public string Query { get; init; } = "";

    [JsonPropertyName("limit")]
    public int? Limit { get; init; }
}

public sealed record RunDomainAgentArgs
{
    [JsonPropertyName("domain")]
    public string Domain { get; init; } = "";

    [JsonPropertyName("goal")]
    public string Goal { get; init; } = "";
}

public sealed record RunWorkflowArgs
{
    [JsonPropertyName("workflow")]
    public string Workflow { get; init; } = "";
}
