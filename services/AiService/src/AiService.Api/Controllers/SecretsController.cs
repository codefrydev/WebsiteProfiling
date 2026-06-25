using System.Text.Json.Nodes;
using AiService.Domain.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>LLM secret keys only — <c>GET/PUT /api/secrets</c> (masked values).</summary>
[ApiController]
[Route("api/secrets")]
[Tags("Config")]
public sealed class SecretsController : ControllerBase
{
    private readonly ILlmConfigRepository _config;

    public SecretsController(ILlmConfigRepository config) => _config = config;

    [HttpGet("")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var rows = await _config.LoadFullAsync(cancellationToken);
        var state = new JsonObject();

        foreach (var row in rows)
        {
            if (!SecretHelpers.IsSecretKey(row.Key) && !row.IsSecret)
            {
                continue;
            }

            if (!string.IsNullOrEmpty(row.Value))
            {
                state[row.Key] = row.IsSecret ? SecretHelpers.Mask : row.Value;
                if (row.IsSecret)
                {
                    state[$"{row.Key}_masked"] = true;
                }
            }
        }

        return Ok(new { state, source = "db" });
    }

    [HttpPut("")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Put([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var state = body["state"] as JsonObject ?? [];
        var existing = await _config.LoadAsync(cancellationToken);
        var updates = new Dictionary<string, string>(existing, StringComparer.Ordinal);

        foreach (var prop in state)
        {
            var key = prop.Key;
            if (key.EndsWith("_masked", StringComparison.Ordinal))
            {
                continue;
            }

            if (!SecretHelpers.IsSecretKey(key))
            {
                continue;
            }

            var val = prop.Value?.ToString() ?? "";
            if (SecretHelpers.IsMaskedSentinel(val))
            {
                continue;
            }

            updates[key] = val;
        }

        await _config.SaveAsync(updates, cancellationToken);
        return Ok(new { ok = true });
    }
}
