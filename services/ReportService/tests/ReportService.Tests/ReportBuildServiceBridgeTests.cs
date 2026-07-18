using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using ReportService.Application.Bridge;
using ReportService.Application.Build;
using ReportService.Application.Options;

namespace ReportService.Tests;

public sealed class ReportBuildServiceBridgeTests
{
    [Fact]
    public async Task BuildAsync_uses_native_path_when_options_false_even_if_env_enables_bridge()
    {
        var prior = Environment.GetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE");
        var handler = new RecordingHandler();
        try
        {
            Environment.SetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE", "1");
            var service = CreateService(handler, usePythonBridge: false);

            await Assert.ThrowsAsync<NullReferenceException>(() =>
                service.BuildAsync(1, null, null, runKeywordEnrich: false, CancellationToken.None));

            Assert.Equal(0, handler.RequestCount);
        }
        finally
        {
            Environment.SetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE", prior);
        }
    }

    [Fact]
    public async Task BuildAsync_uses_bridge_when_options_true()
    {
        var handler = new RecordingHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"ok":true,"exitCode":0,"log":""}""", Encoding.UTF8, "application/json"),
        });
        var service = CreateService(handler, usePythonBridge: true);

        var result = await service.BuildAsync(1, null, null, runKeywordEnrich: false, CancellationToken.None);

        Assert.True(result.Ok);
        Assert.Equal(1, handler.RequestCount);
        Assert.Contains("/internal/report/build", handler.LastPath);
    }

    private static ReportBuildService CreateService(RecordingHandler handler, bool usePythonBridge)
    {
        var httpFactory = new SingleClientFactory(new HttpClient(handler));
        return new ReportBuildService(
            new FastApiPythonBridge(
                httpFactory,
                Options.Create(new FastApiOptions { BaseUrl = "http://fastapi.local" })),
            nativeBuilder: null!,
            crawlRepository: null!,
            categoryBuilder: null!,
            Options.Create(new ReportServiceOptions { UsePythonBridge = usePythonBridge }),
            httpFactory,
            NullLogger<ReportBuildService>.Instance);
    }

    private sealed class SingleClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private sealed class RecordingHandler(HttpResponseMessage? response = null) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        public string LastPath { get; private set; } = "";

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestCount++;
            LastPath = request.RequestUri?.AbsolutePath ?? "";
            return Task.FromResult(response ?? new HttpResponseMessage(HttpStatusCode.NotFound));
        }
    }
}
