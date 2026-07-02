using IntegrationsService.Application;
using IntegrationsService.Providers;
using WebsiteProfiling.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.AddWebsiteProfilingWebDefaults(
    "Website Profiling Integrations API",
    "Internal Google integrations service (GSC/GA4 fetch, property OAuth state). "
    + "Reached by the BFF and worker via INTEGRATIONS_SERVICE_URL.");

builder.Services.AddIntegrationsApplication();
builder.Services.AddGoogleProviders();
builder.Services.AddControllers();

var app = builder.Build();

app.UseWebsiteProfilingSwaggerUi("Website Profiling Integrations API");

app.MapControllers();

app.Run();

public partial class Program;
