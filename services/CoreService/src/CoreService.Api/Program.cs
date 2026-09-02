using CoreService.Api.Application;
using CoreService.Api.DataApplication;
using CoreService.Api.IntegrationsApplication;
using CoreService.Api.Providers;
using WebsiteProfiling.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.AddWebsiteProfilingWebDefaults(
    "Website Profiling Core API",
    "Internal core backend service: report build & reads, pipeline orchestration, "
    + "portfolio, exports, and Google/Bing integrations. "
    + "Reached by the BFF and worker via CORE_SERVICE_URL.");

builder.Services.AddReportApplication();
builder.Services.AddDataApplication();
builder.Services.AddIntegrationsApplication();
builder.Services.AddGoogleProviders();
builder.Services.AddControllers();

var app = builder.Build();

app.UseWebsiteProfilingSwaggerUi("Website Profiling Core API");

app.MapControllers();

app.Run();

namespace CoreService.Api
{
    public partial class Program;
}
