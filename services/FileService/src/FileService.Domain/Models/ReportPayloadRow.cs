namespace FileService.Domain.Models;

/// <summary>
/// Read-only mapping of the existing <c>report_payload</c> table (owned by Alembic migrations).
/// FileService never writes or migrates this table; it only reads the JSON payload to render
/// PDF / Excel / CSV / JSON / sitemap exports. Mirrors the Data service's ReportPayload entity.
/// </summary>
public sealed class ReportPayloadRow
{
    public long Id { get; set; }

    /// <summary><c>generated_at TIMESTAMPTZ</c> → <see cref="DateTimeOffset"/>.</summary>
    public DateTimeOffset GeneratedAt { get; set; }

    public string? SiteName { get; set; }

    public string? CanonicalDomain { get; set; }

    /// <summary><c>data JSONB</c> as raw JSON text; parsed with System.Text.Json by callers.</summary>
    public string Data { get; set; } = "{}";
}
