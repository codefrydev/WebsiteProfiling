using System;

namespace Schema.Model.Entities;

public partial class AuditLog
{
    public long Id { get; set; }

    public string Action { get; set; } = null!;

    public string? Actor { get; set; }

    public long? PropertyId { get; set; }

    public string? Detail { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
