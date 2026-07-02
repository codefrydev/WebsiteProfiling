using ReportService.Application;
using WebsiteProfiling.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.AddWebsiteProfilingWebDefaults(
    "Website Profiling Report API",
    "Internal report build and pipeline orchestration service. "
    + "Reached by the worker and BFF via REPORT_SERVICE_URL.");

builder.Services.AddReportApplication();
builder.Services.AddControllers();

var app = builder.Build();

app.UseWebsiteProfilingSwaggerUi("Website Profiling Report API");

app.MapControllers();

app.Run();

public partial class Program;
