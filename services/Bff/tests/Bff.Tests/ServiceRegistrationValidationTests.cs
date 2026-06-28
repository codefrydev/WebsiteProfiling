using Bff.Api.Forwarding;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Testing;

namespace Bff.Tests;

public sealed class ServiceRegistrationValidationTests
{
    [Fact]
    public void Web_host_resolves_core_services()
    {
        using var env = ServiceRegistrationTestEnvironment.Push();
        env.SetDefaultsForPostgresServices();
        env.Set("FILE_SERVICE_URL", "http://127.0.0.1:8097");
        env.Set("DATA_SERVICE_URL", "http://127.0.0.1:8091");
        env.Set("AI_SERVICE_URL", "http://127.0.0.1:8092");
        env.Set("INTEGRATIONS_SERVICE_URL", "http://127.0.0.1:8093");
        env.Set("REPORT_SERVICE_URL", "http://127.0.0.1:8094");
        env.Set("CONFIG_SERVICE_URL", "http://127.0.0.1:8095");

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
        });

        factory.Services.GetRequiredService<IUpstreamForwarder>();
    }
}
