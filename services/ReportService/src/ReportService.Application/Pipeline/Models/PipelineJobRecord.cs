namespace ReportService.Application.Pipeline.Models;

public sealed record PipelineJobRecord
{
    public required string Id { get; init; }

    public string JobType { get; init; } = "";

    public string Status { get; init; } = "";

    public int? ExitCode { get; init; }

    public string Log { get; init; } = "";

    public string? Error { get; init; }

    public bool LogTruncated { get; init; }

    public long? PropertyId { get; init; }

    public string? StartedAt { get; init; }

    public string? FinishedAt { get; init; }

    public string? Command { get; init; }
}

public sealed record ClaimedPipelineJob
{
    public required string Id { get; init; }

    public string JobType { get; init; } = "";

    public string? Command { get; init; }

    public long? PropertyId { get; init; }
}
