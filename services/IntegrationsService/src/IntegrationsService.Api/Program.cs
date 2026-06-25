using IntegrationsService.Application;
using IntegrationsService.Providers;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddIntegrationsApplication();
builder.Services.AddGoogleProviders();
builder.Services.AddControllers();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Website Profiling Integrations API",
        Version = "v1",
        Description =
            "Internal Google integrations service (GSC/GA4 fetch, property OAuth state). "
            + "Reached by the BFF and worker via INTEGRATIONS_SERVICE_URL.",
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Website Profiling Integrations API v1");
        options.RoutePrefix = "docs";
    });
}

app.MapControllers();

app.Run();

public partial class Program;
