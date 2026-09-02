using System.Net;
using System.Text;
using System.Text.Json;
using CoreService.Api.Application.Bridge;
using CoreService.Api.Application.Options;
using CoreService.Api.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace CoreService.Tests;

public sealed class PipelinePreviewControllerTests
{
    [Fact]
    public async Task Preview_forwards_request_body_to_fastapi_bridge_and_relays_response()
    {
        var canned = """{"status":"success","steps":[],"finalMarkdown":"hello"}""";
        var controller = CreateController(new Dictionary<string, HttpResponseMessage>
        {
            ["/internal/pipeline/preview"] = JsonResponse(HttpStatusCode.OK, canned),
        });

        var body = JsonSerializer.Deserialize<JsonElement>("""{"html":"<html></html>"}""");
        var result = await controller.Preview(body, CancellationToken.None);

        var content = Assert.IsType<Microsoft.AspNetCore.Mvc.ContentResult>(result);
        Assert.Equal(StatusCodes.Status200OK, content.StatusCode);
        Assert.Equal("application/json", content.ContentType);
        Assert.Equal(canned, content.Content);
    }

    [Fact]
    public async Task Preview_propagates_upstream_non_success_status()
    {
        var errorBody = """{"detail":"Either 'url' or 'html' is required"}""";
        var controller = CreateController(new Dictionary<string, HttpResponseMessage>
        {
            ["/internal/pipeline/preview"] = JsonResponse(HttpStatusCode.BadRequest, errorBody),
        });

        var body = JsonSerializer.Deserialize<JsonElement>("{}");
        var result = await controller.Preview(body, CancellationToken.None);

        var content = Assert.IsType<Microsoft.AspNetCore.Mvc.ContentResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, content.StatusCode);
        Assert.Equal(errorBody, content.Content);
    }

    private static PipelinePreviewController CreateController(IReadOnlyDictionary<string, HttpResponseMessage> routes)
    {
        var bridge = new FastApiPythonBridge(
            new RoutingHttpClientFactory(routes),
            Options.Create(new FastApiOptions { BaseUrl = "http://fastapi.local" }));
        return new PipelinePreviewController(bridge);
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode status, string body)
        => new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class RoutingHttpClientFactory(IReadOnlyDictionary<string, HttpResponseMessage> routes) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
            => new(new RoutingHandler(routes)) { BaseAddress = new Uri("http://localhost") };
    }

    private sealed class RoutingHandler(IReadOnlyDictionary<string, HttpResponseMessage> routes) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
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
                    "application/json");
            }

            return clone;
        }
    }
}
