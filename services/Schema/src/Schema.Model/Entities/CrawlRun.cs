using System;

namespace Schema.Model.Entities;

public partial class CrawlRun
{
    public long Id { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public string? StartUrl { get; set; }

    public long? PropertyId { get; set; }

    public string? RenderMode { get; set; }

    public string? DiscoveryMode { get; set; }

    /// <summary>
    /// Self-references <see cref="Id"/>, pairing a desktop crawl with its mobile counterpart. Widened
    /// to <c>bigint</c> (was <c>integer</c> under the old Alembic-managed schema) so it's a normal,
    /// EF-modeled self-referencing FK — see <c>SchemaDbContext.Customizations.cs</c>.
    /// </summary>
    public long? MobileRunId { get; set; }

    public string? PauseState { get; set; }

    public string? PausedAt { get; set; }
}
