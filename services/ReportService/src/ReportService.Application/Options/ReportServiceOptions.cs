namespace ReportService.Application.Options;

public sealed class ReportServiceOptions
{
    public const string SectionName = "ReportService";

    /// <summary>
    /// When true (default), report build delegates to Python FastAPI /internal/report/build.
    /// Set REPORT_SERVICE_USE_PYTHON_BRIDGE=0 once native C# report build is complete.
    /// </summary>
    public bool UsePythonBridge { get; set; } = true;

    public string IntegrationsServiceUrl { get; set; } = "http://127.0.0.1:8093";

    public string AiServiceUrl { get; set; } = "http://127.0.0.1:8092";
}
