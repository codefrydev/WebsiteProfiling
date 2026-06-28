namespace FileService.Application.Options;

/// <summary>
/// HTTP base URL for the Site Audit app-settings / branding API (used by <c>AppSettingsClient</c>).
/// Report <em>payloads</em> are no longer fetched over HTTP — they are read directly from Postgres
/// (see <c>DbReportDataClient</c> / <c>DatabaseOptions</c>).
/// </summary>
public sealed class ReportApiOptions
{
    public const string SectionName = "ReportApi";

    public string BaseUrl { get; set; } = "http://127.0.0.1:8096";
    public int TimeoutSeconds { get; set; } = 120;
}
