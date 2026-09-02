using Bff.Api.Application;
using Bff.Api.Auth;
using Bff.Api.Endpoints;
using Bff.Api.Forwarding;
using Bff.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using WebsiteProfiling.Hosting;

const string CorsPolicy = "bff";

var builder = WebApplication.CreateBuilder(args);

builder.AddWebsiteProfilingWebDefaults(
    "Website Profiling BFF",
    "Backend-for-Frontend gateway: the single browser-facing API surface. Owns auth + CORS "
    + "and proxies to the internal FastAPI and Data backends.");

builder.Services.AddBffApplication();
builder.Services.AddSingleton<IUpstreamForwarder, UpstreamForwarder>();

builder.Services
    .AddAuthentication(WpSessionDefaults.Scheme)
    .AddScheme<AuthenticationSchemeOptions, WpSessionAuthenticationHandler>(WpSessionDefaults.Scheme, null);
builder.Services.AddAuthorization();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<UpstreamExceptionHandler>();

var corsOrigins = ResolveCorsOrigins(builder.Configuration);
builder.Services.AddCors(options => options.AddPolicy(CorsPolicy, policy =>
    policy.WithOrigins(corsOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

// Large uploads (logs/upload, credentials/upload, page-markdown/extract) — parity with the TS proxy.
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 256L * 1024 * 1024);

var app = builder.Build();

app.UseExceptionHandler();

app.UseWebsiteProfilingSwaggerUi("Website Profiling BFF");

// CORS before auth so denied (401/403) responses still carry CORS headers for the browser.
app.UseCors(CorsPolicy);
app.UseAuthentication();
app.UseMiddleware<AccessControlMiddleware>();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }))
    .WithName("HealthCheck")
    .WithTags("Health");

app.MapAuthEndpoints();
app.MapProxyEndpoints();

app.Run();

static string[] ResolveCorsOrigins(IConfiguration config)
{
    var env = Environment.GetEnvironmentVariable("BFF_ALLOWED_ORIGINS");
    if (!string.IsNullOrWhiteSpace(env))
    {
        return env.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }
    var fromConfig = config.GetSection("Cors:AllowedOrigins").Get<string[]>();
    if (fromConfig is { Length: > 0 })
    {
        return fromConfig;
    }
    return ["http://localhost:3000"];
}

namespace Bff.Api
{
    public partial class Program;
}
