using System.Text.Json.Nodes;
using AiService.Application.Services;
using AiService.Domain.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>Ollama runtime status — <c>GET /api/ollama/status</c>.</summary>
[ApiController]
[Route("api/ollama")]
[Tags("Ollama")]
public sealed class OllamaController : ControllerBase
{
    private const string DefaultBase = "http://127.0.0.1:11434";

    private readonly ILlmSettingsRepository _settings;
    private readonly OllamaCatalogService _catalog;

    public OllamaController(ILlmSettingsRepository settings, OllamaCatalogService catalog)
    {
        _settings = settings;
        _catalog = catalog;
    }

    [HttpGet("status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Status(CancellationToken cancellationToken)
    {
        var settings = await _settings.LoadAsync(cancellationToken);
        var baseUrl = (settings.OllamaBaseUrl ?? DefaultBase).Trim().TrimEnd('/');
        var configuredModel = (settings.ActiveModel ?? "").Trim();

        var result = await _catalog.FetchModelsAsync(baseUrl, cancellationToken);
        if (result["ok"]?.GetValue<bool?>() != true)
        {
            return Ok(new JsonObject
            {
                ["ok"] = false,
                ["baseUrl"] = result["baseUrl"]?.GetValue<string>() ?? baseUrl,
                ["configuredModel"] = configuredModel,
                ["error"] = result["error"]?.GetValue<string>() ?? "Cannot reach Ollama. Is it running?",
                ["models"] = new JsonArray(),
                ["cloudCatalogOk"] = false,
                ["localOk"] = false,
            });
        }

        var models = (result["models"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .ToList();

        var modelInstalled = OllamaCatalogService.ModelIsConfigured(models, configuredModel);
        var configuredEntry = models.FirstOrDefault(m =>
            string.Equals(m["name"]?.GetValue<string>(), configuredModel, StringComparison.OrdinalIgnoreCase));

        var supportsTools = configuredEntry?["capabilities"] is JsonArray caps && caps.Any(c => c?.GetValue<string>() == "tools")
            ? true
            : OllamaCatalogService.ModelsSupportTools(models);

        return Ok(new JsonObject
        {
            ["ok"] = true,
            ["baseUrl"] = result["baseUrl"]?.GetValue<string>() ?? baseUrl,
            ["configuredModel"] = configuredModel,
            ["modelInstalled"] = modelInstalled,
            ["supportsTools"] = supportsTools,
            ["cloudCatalogOk"] = result["cloudCatalogOk"]?.GetValue<bool?>() ?? false,
            ["localOk"] = result["localOk"]?.GetValue<bool?>() ?? false,
            ["catalogSource"] = "live",
            ["cloudModelCount"] = models.Count(m => m["source"]?.GetValue<string>() == "cloud"),
            ["models"] = result["models"]?.DeepClone(),
        });
    }
}
