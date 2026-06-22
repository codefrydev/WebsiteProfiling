using FileService.Application.Clients;
using FileService.Application.Options;
using FileService.Application.Services;
using FileService.Rendering;
using Microsoft.Extensions.DependencyInjection;

namespace FileService.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddFileServiceApplication(this IServiceCollection services)
    {
        services.AddOptions<ReportApiOptions>()
            .BindConfiguration(ReportApiOptions.SectionName)
            .PostConfigure(o =>
            {
                var env = Environment.GetEnvironmentVariable("REPORT_API_URL");
                if (!string.IsNullOrWhiteSpace(env))
                {
                    o.BaseUrl = env.Trim();
                }
            });

        services.AddHttpClient<IReportDataClient, ReportDataClient>();
        services.AddHttpClient<IAppSettingsClient, AppSettingsClient>();
        services.AddHttpClient<ILogoFetcher, LogoFetcher>();
        services.AddSingleton<AuditPdfGenerator>();
        services.AddSingleton<AuditWorkbookGenerator>();
        services.AddScoped<IPdfReportService, PdfReportService>();
        services.AddScoped<IWorkbookReportService, WorkbookReportService>();
        return services;
    }
}
