using Data.Application;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDataApplication();
builder.Services.AddControllers();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Website Profiling Data API",
        Version = "v1",
        Description =
            "Internal read-only data service. Reads Postgres directly and incrementally replaces "
            + "FastAPI read endpoints. Reached only by the BFF (not browser-facing).",
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Website Profiling Data API v1");
        options.RoutePrefix = "docs";
    });
}

app.MapControllers();

app.Run();

public partial class Program;
