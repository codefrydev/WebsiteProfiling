using System.Net;
using Bff.Api.Forwarding;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bff.Tests;

public sealed class UpstreamForwarderTests
{
    [Fact]
    public async Task ForwardAsync_returns_502_when_base_address_missing()
    {
        var factory = new NullBaseAddressClientFactory();
        var forwarder = new UpstreamForwarder(factory, NullLogger<UpstreamForwarder>.Instance);
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        await forwarder.ForwardAsync(context, "test-client", "/api/x", disableResponseBuffering: false, CancellationToken.None);

        Assert.Equal(StatusCodes.Status502BadGateway, context.Response.StatusCode);
        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();
        Assert.Contains("not configured", body, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class NullBaseAddressClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new() { BaseAddress = null };
    }
}
