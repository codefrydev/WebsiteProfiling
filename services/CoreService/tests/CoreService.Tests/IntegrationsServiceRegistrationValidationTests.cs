using CoreService.Api.IntegrationsApplication.Google;
using CoreService.Api.IntegrationsApplication.Report;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Testing;

namespace CoreService.Tests;

public sealed class IntegrationsServiceRegistrationValidationTests
{
    [Fact]
    public void Web_host_resolves_core_services()
    {
        using var env = ServiceRegistrationTestEnvironment.Push();
        env.SetDefaultsForPostgresServices();

        using var factory = new WebApplicationFactory<Api.Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
        });

        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<ReportEnrichmentService>();
        scope.ServiceProvider.GetRequiredService<GoogleFetchService>();
        scope.ServiceProvider.GetRequiredService<IGoogleCredentialFactory>();
    }
}
