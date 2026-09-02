namespace CoreService.Api.Application.Options;

public sealed class ReportServiceOptions
{
    public const string SectionName = "ReportService";

    /// <summary>
    /// When true, report build delegates to Python FastAPI /internal/report/build.
    /// Default false (native C# build). Override via <c>REPORT_SERVICE_USE_PYTHON_BRIDGE=1</c> or appsettings.
    /// </summary>
    public bool UsePythonBridge { get; set; } = false;

    public string IntegrationsServiceUrl { get; set; } = "http://127.0.0.1:8093";

    public string AiServiceUrl { get; set; } = "http://127.0.0.1:8092";
}
