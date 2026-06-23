using System.Net;
using Bff.Application.Http;

namespace Bff.Tests;

public class IdempotentRetryHandlerTests
{
    [Fact]
    public async Task Retries_transient_failures_for_GET()
    {
        var inner = new CountingHandler(HttpStatusCode.ServiceUnavailable);
        using var invoker = new HttpMessageInvoker(new IdempotentRetryHandler { InnerHandler = inner });

        using var response = await invoker.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "http://upstream/x"), CancellationToken.None);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(3, inner.Count); // initial + 2 retries
    }

    [Fact]
    public async Task Does_not_retry_POST()
    {
        var inner = new CountingHandler(HttpStatusCode.ServiceUnavailable);
        using var invoker = new HttpMessageInvoker(new IdempotentRetryHandler { InnerHandler = inner });

        using var response = await invoker.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "http://upstream/x"), CancellationToken.None);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(1, inner.Count); // never retried — mutations must not double-submit
    }

    [Fact]
    public async Task Does_not_retry_successful_GET()
    {
        var inner = new CountingHandler(HttpStatusCode.OK);
        using var invoker = new HttpMessageInvoker(new IdempotentRetryHandler { InnerHandler = inner });

        using var response = await invoker.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "http://upstream/x"), CancellationToken.None);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, inner.Count);
    }

    private sealed class CountingHandler(HttpStatusCode status) : HttpMessageHandler
    {
        public int Count { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Count++;
            return Task.FromResult(new HttpResponseMessage(status));
        }
    }
}
