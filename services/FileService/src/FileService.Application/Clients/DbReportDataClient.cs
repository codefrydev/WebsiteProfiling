using System.Text.Json;
using FileService.Application.Persistence;
using FileService.Domain.Models;
using Microsoft.EntityFrameworkCore;

namespace FileService.Application.Clients;

/// <summary>
/// Reads report payloads directly from Postgres (read-only EF Core), replacing the old HTTP hop to the
/// Python report API. Implements the same <see cref="IReportDataClient"/> contract, so PdfReportService,
/// WorkbookReportService and the export services are unaffected by the data-source change.
/// </summary>
public sealed class DbReportDataClient(ReportDbContext db) : IReportDataClient
{
    public async Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default)
    {
        var rows = await db.ReportPayloads
            .OrderByDescending(r => r.Id)
            .Select(r => new { r.Id, r.CanonicalDomain, r.SiteName, r.GeneratedAt })
            .ToListAsync(cancellationToken);

        return rows.Select(r => new ReportListRow
        {
            Id = (int)r.Id,
            CanonicalDomain = r.CanonicalDomain,
            SiteName = r.SiteName,
            GeneratedAt = r.GeneratedAt.ToString("o"),
        }).ToList();
    }

    public async Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default)
    {
        var data = await db.ReportPayloads
            .Where(r => r.Id == reportId)
            .Select(r => r.Data)
            .FirstOrDefaultAsync(cancellationToken);

        if (data is null)
        {
            return null;
        }

        using var doc = JsonDocument.Parse(data);
        return doc.RootElement.Clone();
    }
}
