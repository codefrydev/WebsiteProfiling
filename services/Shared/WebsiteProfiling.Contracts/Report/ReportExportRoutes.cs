namespace WebsiteProfiling.Contracts.Report;

/// <summary>Route segment and query parameter names shared between the BFF's proxy path-builders
/// (ProxyEndpoints.cs) and the Data service's ReportExportController, so the two can't drift.</summary>
public static class ReportExportRoutes
{
    public const string V1ReportsPrefix = "v1/reports";

    public const string ReportIdParam = "reportId";
    public const string DomainParam = "domain";
    public const string DispositionParam = "disposition";
    public const string ProfileParam = "profile";
    public const string BrandingParam = "branding";
    public const string FormatParam = "format";
}
