using ConfigService.Application.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Testing;

namespace ConfigService.Tests;

public sealed class ServiceRegistrationValidationTests
{
    [Fact]
    public void Web_host_resolves_core_services()
    {
        using var env = ServiceRegistrationTestEnvironment.Push();
        env.SetDefaultsForPostgresServices();

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
        });

        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<IPipelineSettingsRepository>();
        scope.ServiceProvider.GetRequiredService<IUiPreferencesRepository>();
        scope.ServiceProvider.GetRequiredService<IClientPreferencesRepository>();
    }
}
