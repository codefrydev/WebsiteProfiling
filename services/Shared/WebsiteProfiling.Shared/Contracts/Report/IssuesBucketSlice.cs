using System.Text.Json.Serialization;

namespace WebsiteProfiling.Contracts.Report;

public sealed record IssuesBucketSlice
{
    [JsonPropertyName("critical")]
    public IReadOnlyList<IssueRecord> Critical { get; init; } = [];

    [JsonPropertyName("high")]
    public IReadOnlyList<IssueRecord> High { get; init; } = [];

    [JsonPropertyName("medium")]
    public IReadOnlyList<IssueRecord> Medium { get; init; } = [];

    [JsonPropertyName("low")]
    public IReadOnlyList<IssueRecord> Low { get; init; } = [];

    public IEnumerable<IssueRecord> AllIssues()
        => Critical.Concat(High).Concat(Medium).Concat(Low);
}
