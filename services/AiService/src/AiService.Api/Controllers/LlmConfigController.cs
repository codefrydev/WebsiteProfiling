using System.Text.Json.Nodes;
using AiService.Domain.Repositories;
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

        return Ok(new { state, source = "db" });
    }

    [HttpPut("")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Put([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var state = body["state"] as JsonObject ?? [];
        var entries = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var prop in state)
        {
            entries[prop.Key] = prop.Value?.ToString() ?? "";
        }

        await _config.SaveAsync(entries, cancellationToken);
        return Ok(new { ok = true });
    }
}
