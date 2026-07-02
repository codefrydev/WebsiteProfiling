namespace ReportService.Domain.Entities;

/// <summary>
/// Mapping of the existing <c>pipeline_jobs</c> table (schema owned by services/Schema).
/// </summary>
public sealed class PipelineJob
{
    public Guid Id { get; set; }

    public string JobType { get; set; } = "pipeline";

    public string Status { get; set; } = "running";

    public int? ExitCode { get; set; }

    public string LogText { get; set; } = "";

    public string? ErrorText { get; set; }

    public long? PropertyId { get; set; }

    public string? ConfigHash { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }

    public bool LogTruncated { get; set; }

    public string? Command { get; set; }

    public bool CancelRequested { get; set; }

    public bool PauseRequested { get; set; }

    public int? WorkerPid { get; set; }
}
