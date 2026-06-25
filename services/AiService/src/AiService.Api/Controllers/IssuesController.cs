using System.Text.Json.Nodes;
using AiService.Application.Dto;
using AiService.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>
/// Issue LLM endpoints ported from FastAPI's <c>/api/issues/*</c> and <c>/api/ai/fix-suggestion</c>.
/// </summary>
[ApiController]
[Route("api/issues")]
[Tags("Issues")]
public sealed class IssuesController : ControllerBase
{
    private readonly FixSuggestionService _fixSuggestions;
    private readonly IssuesActionPlanService _actionPlan;

    public IssuesController(FixSuggestionService fixSuggestions, IssuesActionPlanService actionPlan)
    {
        _fixSuggestions = fixSuggestions;
        _actionPlan = actionPlan;
    }

    [HttpPost("fix-suggestion")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> FixSuggestion([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var message = (body["message"]?.GetValue<string>() ?? "").Trim();
        if (string.IsNullOrEmpty(message))
        {
            return BadRequest(new { detail = "message required" });
        }

        var payload = new JsonObject
        {
            ["source"] = "issue",
            ["message"] = message,
            ["url"] = body["url"]?.DeepClone(),
            ["priority"] = body["priority"]?.DeepClone(),
            ["category"] = body["category"]?.DeepClone(),
            ["recommendation"] = body["recommendation"]?.DeepClone(),
            ["type"] = body["type"]?.DeepClone(),
            ["refresh"] = body["refresh"]?.DeepClone(),
        };

        try
        {
            var result = await _fixSuggestions.GenerateAsync(payload, body.GetRefresh(), cancellationToken);
            if (result["ok"]?.GetValue<bool?>() == false)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { detail = result["error"]?.GetValue<string>() ?? "Fix suggestion failed" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = $"Fix suggestion failed: {ex.Message}" });
        }
    }

    [HttpPost("action-plan")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> ActionPlan([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var domain = (body["domain"]?.GetValue<string>() ?? "").Trim();
        if (string.IsNullOrEmpty(domain))
        {
            return BadRequest(new { detail = "domain required" });
        }

        if (body["issues"] is not JsonArray issues || issues.Count == 0)
        {
            return BadRequest(new { detail = "issues required" });
        }

        try
        {
            var result = await _actionPlan.GenerateAsync(body, body.GetRefresh(), cancellationToken);
            if (result["ok"]?.GetValue<bool?>() == false)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { detail = result["error"]?.GetValue<string>() ?? "Action plan failed" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = $"Action plan failed: {ex.Message}" });
        }
    }
}

[ApiController]
[Route("api/ai")]
[Tags("Issues")]
public sealed class AiFixSuggestionController : ControllerBase
{
    private readonly FixSuggestionService _fixSuggestions;

    public AiFixSuggestionController(FixSuggestionService fixSuggestions) => _fixSuggestions = fixSuggestions;

    [HttpPost("fix-suggestion")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> FixSuggestion([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var message = (body["message"]?.GetValue<string>() ?? "").Trim();
        if (string.IsNullOrEmpty(message))
        {
            return BadRequest(new { detail = "message required" });
        }

        var payload = new JsonObject
        {
            ["source"] = body["source"]?.GetValue<string>() ?? "issue",
            ["message"] = message,
            ["url"] = body["url"]?.DeepClone(),
            ["refresh"] = body["refresh"]?.DeepClone(),
            ["context"] = body["context"]?.DeepClone(),
            ["priority"] = body["priority"]?.DeepClone(),
            ["category"] = body["category"]?.DeepClone(),
            ["recommendation"] = body["recommendation"]?.DeepClone(),
            ["type"] = body["type"]?.DeepClone(),
        };

        try
        {
            var result = await _fixSuggestions.GenerateAsync(payload, body.GetRefresh(), cancellationToken);
            if (result["ok"]?.GetValue<bool?>() == false)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { detail = result["error"]?.GetValue<string>() ?? "Fix suggestion failed" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = $"Fix suggestion failed: {ex.Message}" });
        }
    }
}
