using System.Text.Json.Nodes;
using AiService.Application.Repositories;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>LLM configuration — <c>GET/PUT /api/llm-config</c>.</summary>
[ApiController]
[Route("api/llm-config")]
[Tags("Config")]
public sealed class LlmConfigController : ControllerBase
{
    private readonly ILlmConfigRepository _config;

    public LlmConfigController(ILlmConfigRepository config) => _config = config;

    [HttpGet("")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var rows = await _config.LoadFullAsync(cancellationToken);
        var state = new JsonObject();
        foreach (var row in rows)
        {
            state[row.Key] = row.Value;
        }

        var resolved = await _config.LoadAsync(cancellationToken);
        return Ok(new
        {
            state,
            source = "db",
            apiKeyConfigured = IsApiKeyConfigured(resolved),
        });
    }

    [HttpPut("")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Put([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var state = body["state"] as JsonObject ?? [];
        var entries = LlmConfigPutHelpers.ParsePutEntries(state);
        await _config.SaveAsync(entries, cancellationToken);
        var resolved = await _config.LoadAsync(cancellationToken);
        return Ok(new { ok = true, apiKeyConfigured = IsApiKeyConfigured(resolved) });
    }

    private static bool IsApiKeyConfigured(IReadOnlyDictionary<string, string> cfg)
    {
        var provider = (cfg.GetValueOrDefault("llm_provider") ?? "none").Trim().ToLowerInvariant();
        if (provider is "" or "none")
        {
            return false;
        }

        if (provider == "ollama")
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(LlmConfigHelpers.ResolveApiKey(cfg));
    }
}
