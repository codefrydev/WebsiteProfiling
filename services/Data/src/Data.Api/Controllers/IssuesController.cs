using Data.Application.Dto.Issues;
using Data.Application.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Data.Api.Controllers;

/// <summary>
/// Issue workflow endpoints ported from FastAPI's <c>/api/issues/*</c> (status only; LLM routes stay on FastAPI).
/// </summary>
[ApiController]
[Route("api/issues")]
[Tags("Issues")]
public sealed class IssuesController : ControllerBase
{
    private readonly IIssueStatusRepository _issues;

    public IssuesController(IIssueStatusRepository issues) => _issues = issues;

    /// <summary>List workflow status rows for a property.</summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(IssueStatusListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> List([FromQuery] int? propertyId, CancellationToken cancellationToken)
    {
        if (propertyId is null or 0)
            return BadRequest(new { detail = "propertyId required" });

        var issues = await _issues.ListAsync(propertyId.Value, cancellationToken);
        return Ok(new IssueStatusListResponse { Issues = issues });
    }

    /// <summary>Create or update workflow status for an issue fingerprint.</summary>
    [HttpPut("status")]
    [ProducesResponseType(typeof(IssueStatusUpsertResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Upsert(
        [FromBody] UpsertIssueStatusRequest body, CancellationToken cancellationToken)
    {
        var message = (body.Message ?? string.Empty).Trim();
        var status = body.Status ?? string.Empty;

        if (body.PropertyId == 0 || string.IsNullOrEmpty(message) || string.IsNullOrEmpty(status))
            return BadRequest(new { detail = "propertyId, message, and valid status required" });

        try
        {
            body.Message = message;
            var issue = await _issues.UpsertAsync(body, cancellationToken);
            return Ok(new IssueStatusUpsertResponse { Issue = issue });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
        catch (InvalidOperationException)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = "issue status upsert failed" });
        }
    }
}
