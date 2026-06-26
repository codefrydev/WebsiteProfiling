using ReportService.Application;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseDefaultServiceProvider((_, options) =>
{
    options.ValidateOnBuild = true;
    options.ValidateScopes = true;
});

builder.Services.AddReportApplication();
builder.Services.AddControllers();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Website Profiling Report API",
        Version = "v1",
        Description =
            "Internal report build and pipeline orchestration service. "
            + "Reached by the worker and BFF via REPORT_SERVICE_URL.",
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Website Profiling Report API v1");
        options.RoutePrefix = "docs";
    });
}

app.MapControllers();

app.Run();

public partial class Program;
