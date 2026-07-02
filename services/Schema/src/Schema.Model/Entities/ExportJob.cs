using System;

namespace Schema.Model.Entities;

public partial class ExportJob
{
    public Guid Id { get; set; }

    public long ReportId { get; set; }

    public string Format { get; set; } = null!;

    public string Status { get; set; } = null!;

    public string? FilePath { get; set; }

    public string? ErrorText { get; set; }

    public long? PropertyId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }
}
