using System;

namespace Schema.Model.Entities;

public partial class PipelineJob
{
    public Guid Id { get; set; }

    public string JobType { get; set; } = null!;

    public string Status { get; set; } = null!;

    public int? ExitCode { get; set; }

    public string LogText { get; set; } = null!;

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
