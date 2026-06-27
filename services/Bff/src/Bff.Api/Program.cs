using Bff.Api.Auth;
using Bff.Api.Endpoints;
using Bff.Api.Forwarding;
using Bff.Api.Infrastructure;
using Bff.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.OpenApi;

const string CorsPolicy = "bff";

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseDefaultServiceProvider((_, options) =>
{
    options.ValidateOnBuild = true;
    options.ValidateScopes = true;
});

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

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Website Profiling BFF",
        Version = "v1",
        Description =
            "Backend-for-Frontend gateway: the single browser-facing API surface. Owns auth + CORS "
            + "and proxies to the internal FastAPI and FileService backends.",
    });
});

// Large uploads (logs/upload, credentials/upload, page-markdown/extract) — parity with the TS proxy.
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 256L * 1024 * 1024);

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Website Profiling BFF v1");
        options.RoutePrefix = "docs";
    });
}

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

public partial class Program;
