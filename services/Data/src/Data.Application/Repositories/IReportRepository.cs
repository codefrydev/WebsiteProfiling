using System.Text.Json.Nodes;
using Data.Application.Dto.Meta;
using Data.Application.Dto.Report;
using Data.Application.Report;

namespace Data.Application.Repositories;

public interface IReportRepository
{
    /// <summary>Port of <c>GET /api/report/meta</c>: report list + crawl-run list.</summary>
    Task<ReportMetaResponse> GetMetaAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Port of <c>get_report_payload</c>: fetches the raw <c>data</c> JSONB column,
    /// resolving by <paramref name="reportId"/> or by domain match. Returns null if not found.
    /// </summary>
    Task<string?> GetPayloadDataAsync(long? reportId, string? domain, CancellationToken ct);

    /// <summary>Report payload JSON plus <c>canonical_domain</c> from the report row.</summary>
    Task<ReportPayloadContext?> GetPayloadContextAsync(long? reportId, string? domain, CancellationToken ct);

    /// <summary>
    /// Port of <c>list_audit_history</c>: ordered by generated_at DESC, optional domain filter
    /// (exact lower-case or slugified regexp_replace match). propertyId is not supported
    /// (report_payload has no property_id column; the Python filter would SQL-error if called).
    /// </summary>
    Task<AuditHistoryResponse> ListAuditHistoryAsync(string? domain, int limit, CancellationToken ct);

    /// <summary>
    /// Port of <c>get_crawl_preview_payload</c>: returns the crawl run header + all crawl_results
    /// rows merged as top_pages. Returns null if the crawl run is not found.
    /// </summary>
    Task<JsonObject?> GetCrawlPreviewPayloadAsync(long crawlRunId, CancellationToken ct);

    /// <summary>
    /// Port of <c>get_mobile_desktop_delta</c>: compares desktop vs mobile crawl results and
    /// returns only URLs where something differs. Returns empty list if no mobile_run_id.
    /// </summary>
    Task<MobileDeltaResponse> GetMobileDeltaAsync(long runId, CancellationToken ct);
}
