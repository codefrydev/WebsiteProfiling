using System.Text.Json.Serialization;

namespace Data.Application.Dto.Issues;

public sealed class IssueStatusRowDto
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("propertyId")]
    public long PropertyId { get; set; }

    [JsonPropertyName("reportId")]
    public long? ReportId { get; set; }

    [JsonPropertyName("issueFingerprint")]
    public string IssueFingerprint { get; set; } = string.Empty;

    [JsonPropertyName("categoryId")]
    public string? CategoryId { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("priority")]
    public string Priority { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("assignee")]
    public string? Assignee { get; set; }

    [JsonPropertyName("note")]
    public string? Note { get; set; }

    [JsonPropertyName("updatedAt")]
    public string UpdatedAt { get; set; } = string.Empty;
}

public sealed class IssueStatusListResponse
{
    [JsonPropertyName("issues")]
    public IReadOnlyList<IssueStatusRowDto> Issues { get; set; } = [];
}

public sealed class IssueStatusUpsertResponse
{
    [JsonPropertyName("issue")]
    public IssueStatusRowDto Issue { get; set; } = new();
}

public sealed class UpsertIssueStatusRequest
{
    [JsonPropertyName("propertyId")]
    public long PropertyId { get; set; }

    [JsonPropertyName("reportId")]
    public long? ReportId { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("priority")]
    public string? Priority { get; set; }

    [JsonPropertyName("categoryId")]
    public string? CategoryId { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("assignee")]
    public string? Assignee { get; set; }

    [JsonPropertyName("note")]
    public string? Note { get; set; }
}
