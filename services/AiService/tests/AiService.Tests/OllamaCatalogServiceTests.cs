using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using AiService.Api.Application.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace AiService.Tests;

public sealed class OllamaCatalogServiceTests
{
    [Fact]
    public void Billing_fields_can_be_applied_to_many_models_without_json_parent_error()
    {
        for (var i = 0; i < 10; i++)
        {
            var tier = OllamaCatalogService.ResolveBillingTier("gemma3:4b-cloud", "cloud");
            var entry = new JsonObject { ["name"] = "gemma3:4b-cloud" };
            entry["billing"] = tier["billing"]?.GetValue<string>();
            entry["requires_subscription"] = tier["requires_subscription"]?.GetValue<bool>() ?? false;
            Assert.Equal("cloud_free", entry["billing"]?.GetValue<string>());
        }
    }

    [Fact]
    public async Task FetchModelsAsync_returns_degraded_when_only_cloud_catalog_reaches()
    {
        var service = CreateService(new Dictionary<string, HttpResponseMessage>
        {
            ["127.0.0.1:11434"] = new(HttpStatusCode.ServiceUnavailable),
            ["ollama.com"] = JsonResponse(new JsonObject
            {
                ["models"] = new JsonArray(new JsonObject { ["name"] = "llama3.2" }),
            }),
        });

        var result = await service.FetchModelsAsync("http://127.0.0.1:11434");

        Assert.True(result["ok"]?.GetValue<bool>());
        Assert.Equal(OllamaConnectionHealth.Degraded, result["health"]?.GetValue<string>());
        Assert.False(result["localOk"]?.GetValue<bool>());
        Assert.True(result["cloudCatalogOk"]?.GetValue<bool>());
        Assert.Null(result["error"]);
        Assert.Contains("not reachable", result["warning"]?.GetValue<string>() ?? "", StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task FetchModelsAsync_returns_offline_when_both_probes_fail()
    {
        var service = CreateService(new Dictionary<string, HttpResponseMessage>
        {
            ["127.0.0.1:11434"] = new(HttpStatusCode.ServiceUnavailable),
            ["ollama.com"] = new(HttpStatusCode.ServiceUnavailable),
        });

        var result = await service.FetchModelsAsync("http://127.0.0.1:11434");

        Assert.False(result["ok"]?.GetValue<bool>());
        Assert.Equal(OllamaConnectionHealth.Offline, result["health"]?.GetValue<string>());
        Assert.Contains("Cannot reach Ollama", result["error"]?.GetValue<string>() ?? "", StringComparison.Ordinal);
        Assert.Null(result["warning"]);
    }

    [Fact]
    public async Task FetchModelsAsync_returns_healthy_when_local_probe_succeeds()
    {
        var service = CreateService(new Dictionary<string, HttpResponseMessage>
        {
            ["127.0.0.1:11434"] = JsonResponse(new JsonObject
            {
                ["models"] = new JsonArray(new JsonObject { ["name"] = "llama3.2" }),
            }),
            ["ollama.com"] = JsonResponse(new JsonObject
            {
                ["models"] = new JsonArray(new JsonObject { ["name"] = "gemma3:4b" }),
            }),
        });

        var result = await service.FetchModelsAsync("http://127.0.0.1:11434");

        Assert.Equal(OllamaConnectionHealth.Healthy, result["health"]?.GetValue<string>());
        Assert.True(result["localOk"]?.GetValue<bool>());
        Assert.True(result["cloudCatalogOk"]?.GetValue<bool>());
        Assert.Null(result["warning"]);
    }

    private static OllamaCatalogService CreateService(IReadOnlyDictionary<string, HttpResponseMessage> routes)
        => new(new RoutingHttpClientFactory(routes), NullLogger<OllamaCatalogService>.Instance);

    private static HttpResponseMessage JsonResponse(JsonObject body)
        => new(HttpStatusCode.OK)
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };

    private sealed class RoutingHttpClientFactory(IReadOnlyDictionary<string, HttpResponseMessage> routes) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
            => new(new RoutingHandler(routes)) { BaseAddress = new Uri("http://localhost") };
    }

    private sealed class RoutingHandler(IReadOnlyDictionary<string, HttpResponseMessage> routes) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri?.ToString() ?? string.Empty;
            foreach (var (key, response) in routes)
            {
                if (!uri.Contains(key, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                return Task.FromResult(Clone(response));
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }

        private static HttpResponseMessage Clone(HttpResponseMessage template)
        {
            var clone = new HttpResponseMessage(template.StatusCode);
            if (template.Content is not null)
            {
                clone.Content = template.Content;
            }

            return clone;
        }
    }
}
