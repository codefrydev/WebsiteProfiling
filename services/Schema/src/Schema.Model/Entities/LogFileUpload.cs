using System;

namespace Schema.Model.Entities;

public partial class LogFileUpload
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public string Filename { get; set; } = null!;

    public int LineCount { get; set; }

    public DateTimeOffset UploadedAt { get; set; }

    public string Analysis { get; set; } = null!;
}
