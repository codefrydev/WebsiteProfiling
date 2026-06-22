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
        services.AddOptions<FastApiOptions>()
            .BindConfiguration(FastApiOptions.SectionName)
            .PostConfigure(o =>
            {
                var env = Environment.GetEnvironmentVariable("FASTAPI_URL");
                if (!string.IsNullOrWhiteSpace(env))
                {
                    o.BaseUrl = env.Trim();
                }
            });

        services.AddHttpClient<IReportDataClient, ReportDataClient>();
        services.AddHttpClient<IAppSettingsClient, AppSettingsClient>();
        services.AddHttpClient<ILogoFetcher, LogoFetcher>();
        services.AddSingleton<AuditPdfGenerator>();
        services.AddScoped<IPdfReportService, PdfReportService>();
        return services;
    }
}
