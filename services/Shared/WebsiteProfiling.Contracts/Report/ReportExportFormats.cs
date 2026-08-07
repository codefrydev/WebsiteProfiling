namespace WebsiteProfiling.Contracts.Report;

/// <summary>Export format identifiers shared between the BFF's proxy path-builders and the Data
/// service's ReportExportController, so the two can't drift out of sync.</summary>
public static class ReportExportFormats
{
    public const string Csv = "csv";
    public const string Pdf = "pdf";
    public const string Json = "json";
    public const string Sitemap = "sitemap";
    public const string Workbook = "workbook";

    /// <summary>Formats accepted by the BFF's /api/report/export endpoint (sitemap and workbook have their own dedicated routes).</summary>
    public static readonly IReadOnlyList<string> ApiFormats = [Csv, Pdf, Json];
}
