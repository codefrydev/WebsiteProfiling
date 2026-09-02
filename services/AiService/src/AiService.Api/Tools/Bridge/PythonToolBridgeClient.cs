using System.Text.Json.Nodes;
using AiService.Api.Tools.Options;
using Microsoft.Extensions.Options;

namespace AiService.Api.Tools.Bridge;

/// <summary>
/// HTTP bridge to Python audit tools via POST <c>{FASTAPI_URL}/api/report/audit-tool</c>.
/// </summary>
public sealed class PythonToolBridgeClient(HttpClient http, IOptions<FastApiOptions> options)
{
    public async Task<JsonObject> InvokeAsync(
        string toolName,
        JsonObject args,
        long propertyId,
        long? reportId = null,
        CancellationToken cancellationToken = default)
    {
        var body = new JsonObject
        {
            ["toolName"] = toolName,
            ["propertyId"] = propertyId,
            ["reportId"] = reportId,
            ["args"] = args,
        };

        using var response = await http.PostAsJsonAsync("api/report/audit-tool", body, cancellationToken);
        response.EnsureSuccessStatusCode();

        var envelope = await response.Content.ReadFromJsonAsync<JsonObject>(cancellationToken);
        if (envelope is null)
        {
            return new JsonObject { ["error"] = "empty response from FastAPI audit-tool endpoint" };
        }

        if (envelope.TryGetPropertyValue("result", out var resultNode) && resultNode is JsonObject result)
        {
            return result;
        }

        return envelope;
    }

    public Uri BaseAddress => http.BaseAddress ?? new Uri(options.Value.BaseUrl);
}
