namespace Data.Domain.Entities;

/// <summary>
/// Read-only mapping of the existing <c>crawl_runs</c> table (schema owned by services/Schema).
/// The Data service never writes or migrates this table.
/// </summary>
public sealed class CrawlRun
{
    public long Id { get; set; }

    /// <summary><c>created_at TIMESTAMPTZ</c> → mapped to <see cref="DateTimeOffset"/>.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    public string? StartUrl { get; set; }

    /// <summary><c>render_mode TEXT DEFAULT 'static'</c> (added in migration 008).</summary>
    public string? RenderMode { get; set; }

    /// <summary><c>discovery_mode TEXT DEFAULT 'spider'</c> (added in migration 013).</summary>
    public string? DiscoveryMode { get; set; }

    /// <summary><c>mobile_run_id INT</c> (added in migration 019) — paired mobile crawl run, or null.</summary>
    public long? MobileRunId { get; set; }
}
