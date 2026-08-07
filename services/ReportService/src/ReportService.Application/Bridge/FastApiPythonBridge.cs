using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ReportService.Application.Options;

namespace ReportService.Application.Bridge;

/// <summary>
/// Delegates report build to Python FastAPI when ReportService has no native builder (Docker / bridge mode).
/// </summary>
public sealed class FastApiPythonBridge(IHttpClientFactory httpClientFactory, IOptions<FastApiOptions> options)
{
    private const string ReportBuildPath = "/internal/report/build";
    private const string RunPath = "/api/run";
    private const string JobsPathPrefix = "/api/jobs/";
    private const string ExecuteSubprocessPath = "/internal/pipeline/execute-subprocess";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static bool ShouldUseBridge()
    {
        var flag = Environment.GetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE");
        return string.Equals(flag, "1", StringComparison.Ordinal)
               || string.Equals(flag, "true", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<ReportBuildBridgeResult> BuildReportAsync(
        long propertyId,
        long? crawlRunId,
        IReadOnlyDictionary<string, string>? config,
        CancellationToken cancellationToken = default)
    {
        var client = CreateClient();
        using var response = await client.PostAsJsonAsync(
            ReportBuildPath,
            new ReportBuildBridgeRequest(propertyId, crawlRunId, config),
            JsonOptions,
            cancellationToken);

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new ReportBuildBridgeResult(false, (int)response.StatusCode, body, null, body);
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var ok = root.TryGetProperty("ok", out var okEl) && okEl.GetBoolean();
            var exitCode = root.TryGetProperty("exitCode", out var ec) && ec.TryGetInt32(out var code) ? code : 0;
            var log = root.TryGetProperty("log", out var logEl) ? logEl.GetString() ?? "" : body;
            var outputPath = root.TryGetProperty("outputPath", out var outEl) ? outEl.GetString() : null;
            return new ReportBuildBridgeResult(ok, exitCode, log, outputPath, body);
        }
        catch (JsonException)
        {
            return new ReportBuildBridgeResult(false, -1, body, null, body);
        }
    }

    public async Task<ForwardRequestResult> ForwardRequestAsync(
        HttpMethod method,
        string pathWithQuery,
        string? jsonBody,
        CancellationToken cancellationToken = default)
    {
        var client = CreateClient();
        using var request = new HttpRequestMessage(method, pathWithQuery.TrimStart('/'));
        if (jsonBody is not null)
        {
            request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
        }

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        return new ForwardRequestResult((int)response.StatusCode, body);
    }

    public async Task<RunJobBridgeResult> EnqueuePipelineRunAsync(
        object body,
        CancellationToken cancellationToken = default)
    {
        var client = CreateClient();
        using var response = await client.PostAsJsonAsync(RunPath, body, JsonOptions, cancellationToken);
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new RunJobBridgeResult(false, null, raw);
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var jobId = doc.RootElement.TryGetProperty("jobId", out var idEl) ? idEl.GetString() : null;
            return new RunJobBridgeResult(true, jobId, raw);
        }
        catch (JsonException)
        {
            return new RunJobBridgeResult(false, null, raw);
        }
    }

    public async Task<JsonDocument?> GetJobAsync(string jobId, CancellationToken cancellationToken = default)
    {
        var client = CreateClient();
        using var response = await client.GetAsync($"{JobsPathPrefix}{Uri.EscapeDataString(jobId)}", cancellationToken);
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        try
        {
            return JsonDocument.Parse(raw);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public async Task<SubprocessBridgeResult> ExecuteClaimedSubprocessAsync(
        string jobId,
        string? command,
        long? propertyId,
        CancellationToken cancellationToken = default)
    {
        var client = CreateClient();
        using var response = await client.PostAsJsonAsync(
            ExecuteSubprocessPath,
            new SubprocessBridgeRequest(jobId, command, propertyId),
            JsonOptions,
            cancellationToken);

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new SubprocessBridgeResult(false, -1, false, false, body);
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var exitCode = root.TryGetProperty("exitCode", out var ec) && ec.TryGetInt32(out var code) ? code : -1;
            var cancelled = root.TryGetProperty("cancelled", out var c) && c.GetBoolean();
            var paused = root.TryGetProperty("paused", out var p) && p.GetBoolean();
            return new SubprocessBridgeResult(true, exitCode, cancelled, paused, null);
        }
        catch (JsonException ex)
        {
            return new SubprocessBridgeResult(false, -1, false, false, ex.Message);
        }
    }

    private HttpClient CreateClient()
    {
        var client = httpClientFactory.CreateClient(nameof(FastApiPythonBridge));
        var baseUrl = (Environment.GetEnvironmentVariable("FASTAPI_URL") ?? options.Value.BaseUrl).Trim().TrimEnd('/');
        client.BaseAddress = new Uri(baseUrl + "/");
        client.Timeout = TimeSpan.FromSeconds(options.Value.TimeoutSeconds);
        return client;
    }
}

public sealed record ReportBuildBridgeRequest(
    long PropertyId,
    long? CrawlRunId,
    IReadOnlyDictionary<string, string>? Config);

public sealed record ReportBuildBridgeResult(
    bool Ok,
    int ExitCode,
    string Log,
    string? OutputPath,
    string RawBody);

public sealed record RunJobBridgeResult(bool Ok, string? JobId, string RawBody);

public sealed record SubprocessBridgeRequest(string JobId, string? Command, long? PropertyId);

public sealed record SubprocessBridgeResult(
    bool Ok,
    int ExitCode,
    bool Cancelled,
    bool Paused,
    string? Error);

public sealed record ForwardRequestResult(int StatusCode, string Body);
