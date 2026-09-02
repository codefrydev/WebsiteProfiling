using System.Net;
using System.Reflection;
using System.Text;
using CoreService.Api.Application.Bridge;
using CoreService.Api.Application.Build;
using CoreService.Api.Application.Options;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace CoreService.Tests;

public sealed class ReportBuildKeywordEnrichTests
{
    [Fact]
    public async Task TryKeywordEnrichAsync_logs_and_returns_on_non_success_status()
    {
        var handler = new RoutingHandler(new Dictionary<string, HttpResponseMessage>
        {
            ["/internal/integrations/keywords/enrich"] = new(HttpStatusCode.GatewayTimeout)
            {
                Content = new StringContent("upstream timeout", Encoding.UTF8, "text/plain"),
            },
        });

        var httpFactory = new SingleClientFactory(new HttpClient(handler));
        var service = new ReportBuildService(
            new FastApiPythonBridge(
                httpFactory,
                Options.Create(new FastApiOptions { BaseUrl = "http://fastapi.local" })),
            nativeBuilder: null!,
            crawlRepository: null!,
            categoryBuilder: null!,
            Options.Create(new ReportServiceOptions { IntegrationsServiceUrl = "http://integrations.local" }),
            httpFactory,
            NullLogger<ReportBuildService>.Instance);

        var method = typeof(ReportBuildService).GetMethod(
            "TryKeywordEnrichAsync",
            BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(method);

        var task = (Task)method!.Invoke(service, [1L, CancellationToken.None])!;
        await task;

        Assert.Single(handler.Requests);
        Assert.Contains("/internal/integrations/keywords/enrich", handler.Requests[0].RequestUri?.AbsolutePath);
    }

    private sealed class SingleClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private sealed class RoutingHandler(IReadOnlyDictionary<string, HttpResponseMessage> routes) : HttpMessageHandler
    {
        public IList<HttpRequestMessage> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            var path = request.RequestUri?.AbsolutePath ?? string.Empty;
            foreach (var (key, response) in routes)
            {
                if (path.Contains(key, StringComparison.OrdinalIgnoreCase))
                {
                    return Task.FromResult(Clone(response));
                }
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }

        private static HttpResponseMessage Clone(HttpResponseMessage template)
        {
            var clone = new HttpResponseMessage(template.StatusCode);
            if (template.Content is not null)
            {
                clone.Content = new StringContent(
                    template.Content.ReadAsStringAsync().GetAwaiter().GetResult(),
                    Encoding.UTF8,
                    template.Content.Headers.ContentType?.MediaType ?? "text/plain");
            }

            return clone;
        }
    }
}
