using System.Net;
using System.Text;
using CoreService.Api.Application.Bridge;
using CoreService.Api.Application.Options;
using Microsoft.Extensions.Options;

namespace CoreService.Tests;

public sealed class FastApiPythonBridgeTests
{
    [Fact]
    public void ShouldUseBridge_false_when_env_unset()
    {
        var prior = Environment.GetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE");
        try
        {
            Environment.SetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE", null);
            Assert.False(FastApiPythonBridge.ShouldUseBridge());
        }
        finally
        {
            Environment.SetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE", prior);
        }
    }

    [Fact]
    public void ShouldUseBridge_true_only_when_explicitly_enabled()
    {
        var prior = Environment.GetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE");
        try
        {
            Environment.SetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE", "1");
            Assert.True(FastApiPythonBridge.ShouldUseBridge());

            Environment.SetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE", "0");
            Assert.False(FastApiPythonBridge.ShouldUseBridge());
        }
        finally
        {
            Environment.SetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE", prior);
        }
    }

    [Fact]
    public async Task BuildReportAsync_returns_not_ok_for_malformed_json_body()
    {
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("not-json", Encoding.UTF8, "application/json"),
        });
        var bridge = new FastApiPythonBridge(
            new SingleClientFactory(new HttpClient(handler)),
            Options.Create(new FastApiOptions { BaseUrl = "http://fastapi.local" }));

        var result = await bridge.BuildReportAsync(1, null, null, CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal(-1, result.ExitCode);
        Assert.Equal("not-json", result.Log);
    }

    private sealed class SingleClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private sealed class StubHandler(HttpResponseMessage response) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(response);
    }
}
