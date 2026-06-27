namespace ReportService.Application.Options;

public sealed class FastApiOptions
{
    public const string SectionName = "FastApi";

    public string BaseUrl { get; set; } = "http://127.0.0.1:8001";

    public int TimeoutSeconds { get; set; } = 1800;
}
