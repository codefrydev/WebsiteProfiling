using System.Text;
using System.Text.Json;

namespace CoreService.Api.IntegrationsApplication.Google;

/// <summary>
/// Delegates Python-only tasks to the FastAPI container when IntegrationsService has no Python runtime (Docker).
/// </summary>
public sealed class FastApiPythonBridge(IHttpClientFactory httpClientFactory)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static bool ShouldUseBridge()
    {
        if (string.Equals(
                Environment.GetEnvironmentVariable("USE_FASTAPI_PYTHON_BRIDGE"),
                "1",
                StringComparison.Ordinal))
        {
            return true;
        }

        var python = (Environment.GetEnvironmentVariable("PYTHON_EXECUTABLE")
            ?? Environment.GetEnvironmentVariable("PYTHON")
            ?? "python3").Trim();
        if (string.IsNullOrEmpty(python))
        {
            return true;
        }

        var repoRoot = ResolveRepoRoot();
        return !Directory.Exists(Path.Combine(repoRoot, "src", "website_profiling"));
    }

    public async Task<PythonCliResult> RunKeywordEnrichAsync(
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        var client = CreateClient();
        using var response = await client.PostAsJsonAsync(
            "/internal/integrations/keywords/enrich",
            new { propertyId },
            JsonOptions,
            cancellationToken);

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new PythonCliResult((int)response.StatusCode, body, "");
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var exitCode = doc.RootElement.TryGetProperty("exitCode", out var ec) && ec.TryGetInt32(out var code)
                ? code
                : 0;
            var log = doc.RootElement.TryGetProperty("log", out var logEl) ? logEl.GetString() ?? body : body;
            return new PythonCliResult(exitCode, log, "");
        }
        catch (JsonException)
        {
            return new PythonCliResult(0, body, "");
        }
    }

    public async Task<JsonDocument?> RunGscLinksImportAsync(
        long propertyId,
        string fileContent,
        string? fileName,
        CancellationToken cancellationToken = default)
    {
        var client = CreateClient();
        using var content = new StringContent(
            JsonSerializer.Serialize(new { propertyId, fileContent, fileName }, JsonOptions),
            Encoding.UTF8,
            "application/json");
        using var response = await client.PostAsync("/internal/integrations/gsc-links/import", content, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        try
        {
            return JsonDocument.Parse(body);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public async Task<(int StatusCode, JsonDocument? Document)> ForwardJsonPostAsync(
        string path,
        object body,
        CancellationToken cancellationToken = default)
    {
        var client = CreateClient();
        using var response = await client.PostAsJsonAsync(
            path.TrimStart('/'),
            body,
            JsonOptions,
            cancellationToken);
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            try
            {
                return ((int)response.StatusCode, JsonDocument.Parse(raw));
            }
            catch (JsonException)
            {
                return ((int)response.StatusCode, null);
            }
        }

        try
        {
            return (200, JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw));
        }
        catch (JsonException)
        {
            return (200, null);
        }
    }

    private HttpClient CreateClient()
    {
        var client = httpClientFactory.CreateClient(nameof(FastApiPythonBridge));
        var baseUrl = (Environment.GetEnvironmentVariable("FASTAPI_URL") ?? "http://127.0.0.1:8096").Trim().TrimEnd('/');
        client.BaseAddress = new Uri(baseUrl + "/");
        client.Timeout = TimeSpan.FromSeconds(120);
        return client;
    }

    private static string ResolveRepoRoot()
    {
        var env = Environment.GetEnvironmentVariable("WEBSITE_PROFILING_ROOT");
        if (!string.IsNullOrWhiteSpace(env))
        {
            return env.Trim();
        }

        return Directory.GetCurrentDirectory();
    }
}
