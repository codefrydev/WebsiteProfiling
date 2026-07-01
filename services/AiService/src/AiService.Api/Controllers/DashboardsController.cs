using AiService.Application.Services;
using AiService.Domain.Models;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>Dashboard AI generation — <c>POST /api/dashboards/ai-generate</c>.</summary>
[ApiController]
[Route("api/dashboards")]
[Tags("Dashboards")]
public sealed class DashboardsController(DashboardAiService dashboardAi) : ControllerBase
{
    [HttpPost("ai-generate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> AiGenerate(
        [FromBody] DashboardAiGenerateRequest request,
        CancellationToken cancellationToken)
    {
        var mode = request.Mode.Trim().ToLowerInvariant();
        if (mode is not ("script" or "widget" or "dashboard"))
        {
            return BadRequest(new { detail = "mode must be script, widget, or dashboard" });
        }

        var prompt = request.Prompt.Trim();
        if (string.IsNullOrEmpty(prompt))
        {
            return BadRequest(new { detail = "prompt required" });
        }

        try
        {
            var result = await dashboardAi.GenerateAsync(request, cancellationToken);
            if (result.Ok) return Ok(result.Data);
            var status = result.Missing
                ? StatusCodes.Status503ServiceUnavailable
                : StatusCodes.Status500InternalServerError;
            return StatusCode(status, new { ok = result.Ok, error = result.Error, missing = result.Missing });
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = ex.Message });
        }
    }
}
