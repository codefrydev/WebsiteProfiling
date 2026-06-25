using AiService.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>Internal link page coach — <c>POST /api/links/page-coach</c>.</summary>
[ApiController]
[Route("api/links")]
[Tags("Page Coach")]
public sealed class PageCoachController : ControllerBase
{
    private readonly PageCoachService _pageCoach;

    public PageCoachController(PageCoachService pageCoach) => _pageCoach = pageCoach;

    [HttpPost("page-coach")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Run([FromBody] PageCoachBody body, CancellationToken cancellationToken)
    {
        var url = (body.Url ?? "").Trim();
        if (string.IsNullOrEmpty(url))
        {
            return BadRequest(new { detail = "url required" });
        }

        try
        {
            var result = await _pageCoach.RunAsync(url, body.Refresh, cancellationToken);
            if (result["ok"]?.GetValue<bool?>() == false)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { detail = result["error"]?.GetValue<string>() ?? "Page coach failed" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = ex.Message });
        }
    }

    public sealed class PageCoachBody
    {
        public string? Url { get; set; }

        public bool Refresh { get; set; }

        public string? CurrentType { get; set; }

        public int? CurrentId { get; set; }

        public string? BaselineType { get; set; }

        public int? BaselineId { get; set; }

        public int? PropertyId { get; set; }
    }
}
