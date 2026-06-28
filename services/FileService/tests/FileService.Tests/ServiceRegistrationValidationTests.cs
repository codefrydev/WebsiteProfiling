using FileService.Application.Services;
using FileService.Rendering;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Testing;

namespace FileService.Tests;

public sealed class ServiceRegistrationValidationTests
{
    [Fact]
    public void Web_host_resolves_core_services()
    {
        using var env = ServiceRegistrationTestEnvironment.Push();
        env.SetDefaultsForPostgresServices();
        env.Set("REPORT_API_URL", "http://127.0.0.1:8096");

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
        });

        factory.Services.GetRequiredService<AuditPdfGenerator>();
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<IPdfReportService>();
        scope.ServiceProvider.GetRequiredService<IReportExportService>();
    }
}
