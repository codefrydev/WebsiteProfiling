using Bff.Application.Http;
using Bff.Application.Options;
using Microsoft.Extensions.DependencyInjection;

namespace Bff.Application;

public static class DependencyInjection
{
    /// <summary>Named HttpClient for normal JSON proxying to FastAPI (with idempotent retry).</summary>
    public const string FastApiClient = "fastapi";

    /// <summary>Named HttpClient for streaming proxying to FastAPI (SSE/exports) — NO retry/buffering.</summary>
    public const string FastApiStreamClient = "fastapi-stream";

    /// <summary>Named HttpClient for the FileService (PDF/Excel exports) — streaming, no retry.</summary>
    public const string FileServiceClient = "fileservice";

    /// <summary>Named HttpClient for the internal Data service (direct-Postgres reads) — idempotent retry.</summary>
    public const string DataClient = "data";

    /// <summary>Named HttpClient for the internal Ai service — idempotent retry.</summary>
    public const string AiClient = "ai";

    /// <summary>Named HttpClient for the internal Integrations service — idempotent retry.</summary>
    public const string IntegrationsClient = "integrations";

    /// <summary>Named HttpClient for Ai service streaming (chat SSE) — no retry/buffering.</summary>
    public const string AiStreamClient = "ai-stream";

    public static IServiceCollection AddBffApplication(this IServiceCollection services)
    {
        services.AddOptions<UpstreamOptions>()
            .BindConfiguration(UpstreamOptions.SectionName)
            .PostConfigure(o =>
            {
                var fastapi = Environment.GetEnvironmentVariable("FASTAPI_URL");
                if (!string.IsNullOrWhiteSpace(fastapi))
                {
                    o.FastApiBaseUrl = fastapi.Trim();
                }
                var files = Environment.GetEnvironmentVariable("FILE_SERVICE_URL");
                if (!string.IsNullOrWhiteSpace(files))
                {
                    o.FileServiceBaseUrl = files.Trim();
                }
                var data = Environment.GetEnvironmentVariable("DATA_SERVICE_URL");
                if (!string.IsNullOrWhiteSpace(data))
                {
                    o.DataBaseUrl = data.Trim();
                }
                var dataRoutes = Environment.GetEnvironmentVariable("DATA_ROUTES");
                if (!string.IsNullOrWhiteSpace(dataRoutes))
                {
                    o.DataRoutes = dataRoutes
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                }
                var ai = Environment.GetEnvironmentVariable("AI_SERVICE_URL");
                if (!string.IsNullOrWhiteSpace(ai))
                {
                    o.AiBaseUrl = ai.Trim();
                }
                var aiRoutes = Environment.GetEnvironmentVariable("AI_ROUTES");
                if (!string.IsNullOrWhiteSpace(aiRoutes))
                {
                    o.AiRoutes = aiRoutes
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                }
                var integrations = Environment.GetEnvironmentVariable("INTEGRATIONS_SERVICE_URL");
                if (!string.IsNullOrWhiteSpace(integrations))
                {
                    o.IntegrationsBaseUrl = integrations.Trim();
                }
                var integrationsRoutes = Environment.GetEnvironmentVariable("INTEGRATIONS_ROUTES");
                if (!string.IsNullOrWhiteSpace(integrationsRoutes))
                {
                    o.IntegrationsRoutes = integrationsRoutes
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                }
            });

        services.AddOptions<AuthOptions>()
            .BindConfiguration(AuthOptions.SectionName)
            .PostConfigure(o =>
            {
                var secret = Environment.GetEnvironmentVariable("AUTH_SECRET")
                    ?? Environment.GetEnvironmentVariable("SESSION_SECRET");
                if (!string.IsNullOrWhiteSpace(secret))
                {
                    o.Secret = secret.Trim();
                }
                var user = Environment.GetEnvironmentVariable("AUTH_USER");
                if (!string.IsNullOrWhiteSpace(user))
                {
                    o.BasicUser = user.Trim();
                }
                var pass = Environment.GetEnvironmentVariable("AUTH_PASSWORD");
                if (pass is not null)
                {
                    o.BasicPassword = pass.Trim();
                }
                var role = Environment.GetEnvironmentVariable("AUTH_DEFAULT_ROLE");
                if (!string.IsNullOrWhiteSpace(role))
                {
                    o.DefaultRole = role.Trim();
                }
                var sameSite = Environment.GetEnvironmentVariable("BFF_COOKIE_SAMESITE");
                if (!string.IsNullOrWhiteSpace(sameSite))
                {
                    o.CookieSameSite = sameSite.Trim();
                }
                var secure = Environment.GetEnvironmentVariable("BFF_COOKIE_SECURE");
                if (!string.IsNullOrWhiteSpace(secure))
                {
                    o.CookieSecure = secure.Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
                }
                var domain = Environment.GetEnvironmentVariable("BFF_COOKIE_DOMAIN");
                if (!string.IsNullOrWhiteSpace(domain))
                {
                    o.CookieDomain = domain.Trim();
                }
            });

        services.AddOptions<BffCorsOptions>()
            .BindConfiguration(BffCorsOptions.SectionName)
            .PostConfigure(o =>
            {
                var origins = Environment.GetEnvironmentVariable("BFF_ALLOWED_ORIGINS");
                if (!string.IsNullOrWhiteSpace(origins))
                {
                    o.AllowedOrigins = origins
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                }
            });

        services.AddTransient<IdempotentRetryHandler>();

        services.AddHttpClient(FastApiClient)
            .ConfigureHttpClient((sp, client) =>
            {
                var opts = GetUpstream(sp);
                client.BaseAddress = NormalizeBase(opts.FastApiBaseUrl);
                client.Timeout = TimeSpan.FromSeconds(Math.Max(5, opts.TimeoutSeconds));
            })
            .AddHttpMessageHandler<IdempotentRetryHandler>();

        // Internal Data service (direct-Postgres reads + issue/portfolio/filter mutations).
        // GET/HEAD retry is safe; POST/PUT/DELETE are forwarded without retry.
        services.AddHttpClient(DataClient)
            .ConfigureHttpClient((sp, client) =>
            {
                var opts = GetUpstream(sp);
                client.BaseAddress = NormalizeBase(opts.DataBaseUrl);
                client.Timeout = TimeSpan.FromSeconds(Math.Max(5, opts.TimeoutSeconds));
            })
            .AddHttpMessageHandler<IdempotentRetryHandler>();

        services.AddHttpClient(AiClient)
            .ConfigureHttpClient((sp, client) =>
            {
                var opts = GetUpstream(sp);
                client.BaseAddress = NormalizeBase(opts.AiBaseUrl);
                client.Timeout = TimeSpan.FromSeconds(Math.Max(5, opts.TimeoutSeconds));
            })
            .AddHttpMessageHandler<IdempotentRetryHandler>();

        services.AddHttpClient(IntegrationsClient)
            .ConfigureHttpClient((sp, client) =>
            {
                var opts = GetUpstream(sp);
                client.BaseAddress = NormalizeBase(opts.IntegrationsBaseUrl);
                client.Timeout = TimeSpan.FromSeconds(Math.Max(5, opts.TimeoutSeconds));
            })
            .AddHttpMessageHandler<IdempotentRetryHandler>();

        services.AddHttpClient(AiStreamClient)
            .ConfigureHttpClient((sp, client) =>
            {
                client.BaseAddress = NormalizeBase(GetUpstream(sp).AiBaseUrl);
                client.Timeout = Timeout.InfiniteTimeSpan;
            });

        services.AddHttpClient(FastApiStreamClient)
            .ConfigureHttpClient((sp, client) =>
            {
                client.BaseAddress = NormalizeBase(GetUpstream(sp).FastApiBaseUrl);
                client.Timeout = Timeout.InfiniteTimeSpan; // SSE/streaming: do not cut the body
            });

        services.AddHttpClient(FileServiceClient)
            .ConfigureHttpClient((sp, client) =>
            {
                var opts = GetUpstream(sp);
                client.BaseAddress = NormalizeBase(opts.FileServiceBaseUrl);
                client.Timeout = TimeSpan.FromSeconds(Math.Max(5, opts.TimeoutSeconds));
            });

        // Typed FastAPI client generated from web/openapi.json (NSwag). The bulk of the gateway
        // proxies opaque payloads via the generic forwarder; this typed client is available for
        // aggregation/composition endpoints that need to read upstream responses by shape.
        services.AddHttpClient<Generated.IFastApiClient, Generated.FastApiClient>()
            .ConfigureHttpClient((sp, client) =>
            {
                var opts = GetUpstream(sp);
                client.BaseAddress = NormalizeBase(opts.FastApiBaseUrl);
                client.Timeout = TimeSpan.FromSeconds(Math.Max(5, opts.TimeoutSeconds));
            })
            .AddHttpMessageHandler<IdempotentRetryHandler>();

        return services;
    }

    private static UpstreamOptions GetUpstream(IServiceProvider sp) =>
        sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<UpstreamOptions>>().Value;

    private static Uri NormalizeBase(string url) => new(url.TrimEnd('/') + "/");
}
