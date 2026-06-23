namespace FileService.Application.Options;

/// <summary>
/// HTTP base URL for the Site Audit report API (JSON payload, meta, app-settings).
/// FileService is not tied to any specific backend framework — only this HTTP contract.
/// </summary>
public sealed class ReportApiOptions
{
    public const string SectionName = "ReportApi";

    public string BaseUrl { get; set; } = "http://127.0.0.1:8001";
    public int TimeoutSeconds { get; set; } = 120;
}
