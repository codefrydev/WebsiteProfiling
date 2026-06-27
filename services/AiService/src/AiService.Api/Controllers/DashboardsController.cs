using System.Text.Json.Nodes;
using AiService.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>Dashboard AI generation — <c>POST /api/dashboards/ai-generate</c>.</summary>
[ApiController]
[Route("api/dashboards")]
[Tags("Dashboards")]
public sealed class DashboardsController : ControllerBase
{
    private readonly DashboardAiService _dashboardAi;

    public DashboardsController(DashboardAiService dashboardAi) => _dashboardAi = dashboardAi;

    [HttpPost("ai-generate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> AiGenerate([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var mode = (body["mode"]?.GetValue<string>() ?? "widget").Trim().ToLowerInvariant();
        if (mode is not ("script" or "widget" or "dashboard"))
        {
            return BadRequest(new { detail = "mode must be script, widget, or dashboard" });
        }

        var prompt = (body["prompt"]?.GetValue<string>() ?? "").Trim();
        if (string.IsNullOrEmpty(prompt))
        {
            return BadRequest(new { detail = "prompt required" });
        }

        try
        {
            var result = await _dashboardAi.GenerateAsync(body, cancellationToken);
            if (result["ok"]?.GetValue<bool?>() == false)
            {
                var status = result.ContainsKey("missing")
                    ? StatusCodes.Status503ServiceUnavailable
                    : StatusCodes.Status500InternalServerError;
                return StatusCode(status, result);
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = ex.Message });
        }
    }
}
