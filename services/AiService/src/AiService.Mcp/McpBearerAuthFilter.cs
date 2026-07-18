using System.Security.Cryptography;
using System.Text;
using AiService.Application.Mcp;
using AiService.Domain.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace AiService.Mcp;

/// <summary>
/// Enforces <c>McpSettingsEntry.BearerToken</c> (Risk Settings &gt; MCP) on the MCP Streamable HTTP
/// endpoint only — attached via <c>AddEndpointFilter&lt;McpBearerAuthFilter&gt;()</c> on the route
/// group returned by <see cref="McpServerExtensions.MapAiServiceMcp"/>, so it never touches other
/// routes. Reads the token via <see cref="IMcpSettingsRepository"/> through a short-lived cache
/// (same pattern as <c>AuditToolSelectionService</c>) so the DB isn't hit on every MCP request,
/// while still picking up token rotation from the Secrets UI within ~30s without a restart.
/// </summary>
public sealed class McpBearerAuthFilter(
    IServiceScopeFactory scopeFactory,
    IMemoryCache cache,
    ILogger<McpBearerAuthFilter> logger) : IEndpointFilter
{
    private const string BearerScheme = "Bearer ";
    private static readonly TimeSpan TokenCacheTtl = TimeSpan.FromSeconds(30);

    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        var token = await GetCurrentTokenAsync(context.HttpContext.RequestAborted);

        if (string.IsNullOrEmpty(token))
        {
            logger.LogWarning(
                "MCP HTTP endpoint (/mcp) rejected request — configure mcp_token in Risk Settings before use.");
            return Results.Unauthorized();
        }

        var header = context.HttpContext.Request.Headers.Authorization.ToString();
        if (!header.StartsWith(BearerScheme, StringComparison.Ordinal)
            || !FixedTimeStringEquals(header[BearerScheme.Length..], token))
        {
            return Results.Unauthorized();
        }

        return await next(context);
    }

    private async Task<string> GetCurrentTokenAsync(CancellationToken cancellationToken)
    {
        return await cache.GetOrCreateAsync(McpAuthCacheKeys.BearerToken, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TokenCacheTtl;
            using var scope = scopeFactory.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<IMcpSettingsRepository>();
            var settings = await repo.LoadAsync(cancellationToken);
            if (string.IsNullOrEmpty(settings.BearerToken))
            {
                logger.LogDebug("MCP bearer token not configured (mcp_token empty).");
            }

            return settings.BearerToken;
        }) ?? "";
    }

    private static bool FixedTimeStringEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(a)),
            SHA256.HashData(Encoding.UTF8.GetBytes(b)));
}
