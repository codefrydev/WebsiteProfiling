using ConfigService.Application;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseDefaultServiceProvider((_, options) =>
{
    options.ValidateOnBuild = true;
    options.ValidateScopes = true;
});

builder.Services.AddConfigApplication();
builder.Services.AddControllers();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Website Profiling Config API",
        Version = "v1",
        Description =
            "Internal typed-config service for pipeline settings, UI preferences, and client preferences. "
            + "Reached only by the BFF (not browser-facing).",
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Website Profiling Config API v1");
        options.RoutePrefix = "docs";
    });
}

app.MapControllers();

app.Run();

public partial class Program;
