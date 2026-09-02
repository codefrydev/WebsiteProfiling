using System.Text.Json.Nodes;
using AiService.Api.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>Unified secrets — <c>GET/PUT /api/secrets</c> (LLM, pipeline, Google).</summary>
[ApiController]
[Route("api/secrets")]
[Tags("Config")]
public sealed class SecretsController(SecretsService secrets) : ControllerBase
{
    [HttpGet("")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var state = await secrets.GetStateAsync(cancellationToken);
        return Ok(new { state, source = "db" });
    }

    [HttpPut("")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Put([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var state = body["state"] as JsonObject ?? [];
        try
        {
            await secrets.PutStateAsync(state, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }

        var refreshed = await secrets.GetStateAsync(cancellationToken);
        return Ok(new { ok = true, state = refreshed, source = "db" });
    }
}
