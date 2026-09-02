using CoreService.Api.DataApplication.Dto.Portfolio;
using CoreService.Api.DataApplication.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

/// <summary>
/// Portfolio mutations ported from FastAPI's <c>/api/portfolio/*</c>.
/// </summary>
[ApiController]
[Route("api/portfolio")]
[Tags("Portfolio")]
public sealed class PortfolioController : ControllerBase
{
    private readonly IPortfolioRepository _portfolio;

    public PortfolioController(IPortfolioRepository portfolio) => _portfolio = portfolio;

    /// <summary>Delete a report and/or crawl run from the portfolio home list.</summary>
    [HttpDelete("delete")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete([FromBody] DeletePortfolioRequest body, CancellationToken cancellationToken)
    {
        if (body.ReportId is null && body.CrawlRunId is null)
            return BadRequest(new { detail = "reportId or crawlRunId required" });

        var deleted = await _portfolio.DeletePortfolioItemAsync(
            body.ReportId, body.CrawlRunId, cancellationToken);

        if (!deleted)
            return NotFound(new { detail = "portfolio item not found" });

        return Ok(new { ok = true });
    }
}
