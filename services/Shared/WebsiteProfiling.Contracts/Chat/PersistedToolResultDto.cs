using System.Text.Json.Serialization;

namespace WebsiteProfiling.Contracts.Chat;

public sealed record PersistedToolResultDto
{
    [JsonPropertyName("narrative")]
    public PersistedNarrativeDto? Narrative { get; init; }

    [JsonPropertyName("tool_events")]
    public IReadOnlyList<PersistedToolEventDto>? ToolEvents { get; init; }

    [JsonPropertyName("agent_error")]
    public string? AgentError { get; init; }
}

public sealed record PersistedNarrativeDto
{
    [JsonPropertyName("power_insights")]
    public IReadOnlyList<string> PowerInsights { get; init; } = [];

    [JsonPropertyName("recommended_actions")]
    public IReadOnlyList<string> RecommendedActions { get; init; } = [];
}

public sealed record PersistedToolEventDto
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("args")]
    public System.Text.Json.Nodes.JsonNode? Args { get; init; }

    [JsonPropertyName("result")]
    public System.Text.Json.Nodes.JsonNode? Result { get; init; }
}

public sealed record LlmNarrativeResponse
{
    [JsonPropertyName("power_insights")]
    public IReadOnlyList<string> PowerInsights { get; init; } = [];

    [JsonPropertyName("recommended_actions")]
    public IReadOnlyList<string> RecommendedActions { get; init; } = [];
}
