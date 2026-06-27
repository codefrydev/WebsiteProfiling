using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using ReportService.Application.Build;
using ReportService.Application.Orchestration;
using WebsiteProfiling.Testing;

namespace ReportService.Tests;

public sealed class ServiceRegistrationValidationTests
{
    [Fact]
    public void Web_host_resolves_core_services()
    {
        using var env = ServiceRegistrationTestEnvironment.Push();
        env.SetDefaultsForPostgresServices();
        env.Set("INTEGRATIONS_SERVICE_URL", "http://127.0.0.1:8093");

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
        });

        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<ReportBuildService>();
        scope.ServiceProvider.GetRequiredService<NativeReportBuilder>();
        scope.ServiceProvider.GetRequiredService<PipelineOrchestratorService>();
    }
}
