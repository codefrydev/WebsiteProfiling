using CoreService.Api.DataApplication.Portfolio;
using CoreService.Api.DataApplication.Report;
using CoreService.Api.DataApplication.Repositories;
using CoreService.Api.DataApplication.Services;
using CoreService.Api.Rendering;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Testing;

namespace CoreService.Tests;

public sealed class DataServiceRegistrationValidationTests
{
    [Fact]
    public void Web_host_resolves_core_services()
    {
        using var env = ServiceRegistrationTestEnvironment.Push();
        env.SetDefaultsForPostgresServices();
        env.Set("REPORT_API_URL", "http://127.0.0.1:8096");

        using var factory = new WebApplicationFactory<Api.Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
        });

        factory.Services.GetRequiredService<AuditPdfGenerator>();
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<IReportSectionService>();
        scope.ServiceProvider.GetRequiredService<IPortfolioService>();
        scope.ServiceProvider.GetRequiredService<IPipelineSettingsRepository>();
        scope.ServiceProvider.GetRequiredService<IUiPreferencesRepository>();
        scope.ServiceProvider.GetRequiredService<IClientPreferencesRepository>();
        scope.ServiceProvider.GetRequiredService<IPdfReportService>();
        scope.ServiceProvider.GetRequiredService<IWorkbookReportService>();
        scope.ServiceProvider.GetRequiredService<IReportExportService>();
    }
}
