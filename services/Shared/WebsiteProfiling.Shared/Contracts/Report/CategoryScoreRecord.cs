using System.Text.Json.Serialization;

namespace WebsiteProfiling.Contracts.Report;

public sealed record CategoryScoreRecord
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("score")]
    public int? Score { get; init; }

    [JsonPropertyName("issue_count")]
    public int IssueCount { get; init; }
}
