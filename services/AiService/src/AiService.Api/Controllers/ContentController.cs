using System.Text.Json.Nodes;
using AiService.Application.Dto;
using AiService.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>Content studio endpoints — <c>POST /api/content/analyze</c> and <c>wizard</c>.</summary>
[ApiController]
[Route("api/content")]
[Tags("Content")]
public sealed class ContentController : ControllerBase
{
    private static readonly HashSet<string> ValidWizardSteps = new(StringComparer.Ordinal)
    {
        "intents", "content_types", "tones", "titles", "outline", "draft", "research",
    };

    private readonly ContentAnalyzeService _analyze;
    private readonly ContentWizardService _wizard;

    public ContentController(ContentAnalyzeService analyze, ContentWizardService wizard)
    {
        _analyze = analyze;
        _wizard = wizard;
    }

    [HttpPost("analyze")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Analyze([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var keyword = (body["keyword"]?.GetValue<string>() ?? "").Trim();
        if (string.IsNullOrEmpty(keyword))
        {
            return BadRequest(new { detail = "keyword required" });
        }

        int? propertyId = body["propertyId"]?.GetValue<int?>();
        try
        {
            var analysis = await _analyze.AnalyzeAsync(
                propertyId,
                keyword,
                body["bodyHtml"]?.GetValue<string>() ?? "",
                body["titleTag"]?.GetValue<string>() ?? "",
                body["metaDescription"]?.GetValue<string>() ?? "",
                body["landingUrl"]?.GetValue<string>(),
                body["useAi"]?.GetValue<bool?>() == true,
                body.GetRefresh(),
                body["title"]?.GetValue<string>() ?? "",
                cancellationToken);

            return Ok(new { analysis });
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = $"Content analyze failed: {ex.Message}" });
        }
    }

    [HttpPost("wizard")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Wizard([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var step = (body["step"]?.GetValue<string>() ?? "").Trim();
        if (!ValidWizardSteps.Contains(step))
        {
            return BadRequest(new { detail = "Invalid wizard step" });
        }

        var payload = new JsonObject
        {
            ["keyword"] = body["keyword"]?.GetValue<string>() ?? "",
            ["locale"] = body["locale"]?.GetValue<string>() ?? "en-US",
            ["intent"] = body["intent"]?.GetValue<string>() ?? "",
            ["contentType"] = body["contentType"]?.GetValue<string>() ?? "",
            ["tone"] = body["tone"]?.GetValue<string>() ?? "",
            ["title"] = body["title"]?.GetValue<string>() ?? "",
            ["outline"] = body["outline"] is JsonArray outline ? outline.DeepClone() : new JsonArray(),
        };

        try
        {
            var result = await _wizard.RunStepAsync(step, payload, cancellationToken);
            if (result["ok"]?.GetValue<bool?>() == false)
            {
                return BadRequest(new { detail = result["error"]?.GetValue<string>() ?? "Wizard step failed" });
            }

            return Ok(new { result });
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = $"Wizard step failed: {ex.Message}" });
        }
    }
}
