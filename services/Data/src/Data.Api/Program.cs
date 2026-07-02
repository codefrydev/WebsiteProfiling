using Data.Application;
using WebsiteProfiling.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.AddWebsiteProfilingWebDefaults(
    "Website Profiling Data API",
    "Internal data service for reports, portfolio, issues, filters, typed config "
    + "(pipeline settings, UI preferences, client preferences), and PDF/Excel/CSV/JSON/sitemap "
    + "report export. Reads Postgres directly and incrementally replaces FastAPI endpoints. "
    + "Reached only by the BFF (not browser-facing).");

builder.Services.AddDataApplication();
builder.Services.AddControllers();

var app = builder.Build();

app.UseWebsiteProfilingSwaggerUi("Website Profiling Data API");

app.MapControllers();

app.Run();

public partial class Program;
