using AiService.Domain.Models;
using AiService.Domain.Repositories;
using AiService.Mcp;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace AiService.Tests;

public sealed class McpBearerAuthFilterTests
{
    [Fact]
    public async Task InvokeAsync_returns_unauthorized_when_token_not_configured()
    {
        var filter = CreateFilter(bearerToken: "");
        var context = CreateInvocationContext();
        var called = false;
        EndpointFilterDelegate next = _ =>
        {
            called = true;
            return ValueTask.FromResult<object?>("ok");
        };

        var result = await filter.InvokeAsync(context, next);

        Assert.False(called);
        Assert.IsType<UnauthorizedHttpResult>(result);
    }

    [Fact]
    public async Task InvokeAsync_returns_unauthorized_for_wrong_token()
    {
        var filter = CreateFilter(bearerToken: "secret-token");
        var context = CreateInvocationContext();
        context.HttpContext.Request.Headers.Authorization = "Bearer wrong";

        var result = await filter.InvokeAsync(context, _ => ValueTask.FromResult<object?>("ok"));

        Assert.IsType<UnauthorizedHttpResult>(result);
    }

    [Fact]
    public async Task InvokeAsync_allows_matching_bearer_token()
    {
        var filter = CreateFilter(bearerToken: "secret-token");
        var context = CreateInvocationContext();
        context.HttpContext.Request.Headers.Authorization = "Bearer secret-token";

        var result = await filter.InvokeAsync(context, _ => ValueTask.FromResult<object?>("ok"));

        Assert.Equal("ok", result);
    }

    private static McpBearerAuthFilter CreateFilter(string bearerToken)
    {
        var services = new ServiceCollection();
        services.AddSingleton<IMcpSettingsRepository>(new FakeMcpSettingsRepository(bearerToken));
        var provider = services.BuildServiceProvider();
        var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();
        return new McpBearerAuthFilter(scopeFactory, new MemoryCache(new MemoryCacheOptions()), NullLogger<McpBearerAuthFilter>.Instance);
    }

    private static DefaultEndpointFilterInvocationContext CreateInvocationContext()
    {
        var httpContext = new DefaultHttpContext();
        return new DefaultEndpointFilterInvocationContext(httpContext);
    }

    private sealed class FakeMcpSettingsRepository(string bearerToken) : IMcpSettingsRepository
    {
        public Task<McpSettings> LoadAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new McpSettings { BearerToken = bearerToken });

        public Task MergeAsync(McpSettingsPatch patch, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }
}
