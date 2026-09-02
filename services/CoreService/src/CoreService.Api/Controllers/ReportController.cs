using CoreService.Api.DataApplication.Dto.Meta;
using CoreService.Api.DataApplication.Dto.Portfolio;
using CoreService.Api.DataApplication.Dto.Report;
using CoreService.Api.DataApplication.Portfolio;
using CoreService.Api.DataApplication.Report;
using CoreService.Api.DataApplication.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

/// <summary>
/// Read endpoints ported from FastAPI's <c>/api/report/*</c>. The BFF forwards the full path
/// here when it is listed in <c>DATA_ROUTES</c>, so the routes must match the FastAPI paths exactly.
/// </summary>
[ApiController]
[Route("api/report")]
[Tags("Report")]
public sealed class ReportController : ControllerBase
{
    private readonly IReportRepository _reports;
    private readonly IReportSectionService _sections;
    private readonly IPortfolioService _portfolio;

    public ReportController(
        IReportRepository reports,
        IReportSectionService sections,
        IPortfolioService portfolio)
    {
        _reports = reports;
        _sections = sections;
        _portfolio = portfolio;
    }

    /// <summary>Report list + crawl-run list (snake_case keys).</summary>
    [HttpGet("meta")]
    [ProducesResponseType(typeof(ReportMetaResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ReportMetaResponse>> GetMeta(CancellationToken cancellationToken) =>
        Ok(await _reports.GetMetaAsync(cancellationToken));

    /// <summary>
    /// Returns the raw JSONB payload, optionally sliced to a named section.
    /// </summary>
    [HttpGet("payload")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPayload(
        [FromQuery] long? reportId,
        [FromQuery] string? domain,
        [FromQuery] string? section,
        CancellationToken cancellationToken)
    {
        if (section is not null && !SectionFields.ValidKeys.Contains(section))
            return StatusCode(StatusCodes.Status400BadRequest, new { detail = "Invalid section" });

        var rawJson = await _reports.GetPayloadDataAsync(reportId, domain, cancellationToken);
        if (rawJson is null)
            return NotFound(new { detail = "Report not found" });

        if (section is not null)
        {
            var slice = await _sections.GetSectionPayloadAsync(reportId, domain, section, cancellationToken);
            if (slice is null)
                return NotFound(new { detail = "Report not found" });

            return Ok(new { payload = slice, section });
        }

        // Full payload: stream raw JSON without double-parsing (avoids re-serialising multi-MB blobs).
        return Content($"{{\"payload\":{rawJson}}}", "application/json");
    }

    /// <summary>
    /// Ordered audit history, optional domain filter.
    /// <paramref name="propertyId"/> is accepted but ignored — report_payload has no property_id column.
    /// </summary>
    [HttpGet("history")]
    [ProducesResponseType(typeof(AuditHistoryResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AuditHistoryResponse>> GetHistory(
        [FromQuery] int? propertyId,
        [FromQuery] string? domain,
        [FromQuery] int limit,
        CancellationToken cancellationToken)
    {
        if (limit <= 0) limit = 20;
        return Ok(await _reports.ListAuditHistoryAsync(domain, limit, cancellationToken));
    }

    [HttpGet("crawl-payload")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetCrawlPayload(
        [FromQuery] long? crawlRunId,
        CancellationToken cancellationToken)
    {
        if (crawlRunId is null or <= 0)
            return StatusCode(StatusCodes.Status400BadRequest, new { detail = "Invalid crawlRunId" });

        var payload = await _reports.GetCrawlPreviewPayloadAsync(crawlRunId.Value, cancellationToken);
        if (payload is null)
            return NotFound(new { detail = "Crawl run not found" });

        return Ok(new { payload });
    }

    [HttpGet("mobile-delta")]
    [ProducesResponseType(typeof(MobileDeltaResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<MobileDeltaResponse>> GetMobileDelta(
        [FromQuery] long? id,
        CancellationToken cancellationToken)
    {
        if (id is null or <= 0)
            return BadRequest(new { detail = "id required" });

        return Ok(await _reports.GetMobileDeltaAsync(id.Value, cancellationToken));
    }

    /// <summary>Portfolio groups, crawl history, summary, or single card widget.</summary>
    [HttpGet("portfolio")]
    [ProducesResponseType(typeof(PortfolioGroupsResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(PortfolioCardResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(PortfolioSummaryResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetPortfolio(
        [FromQuery] string widget = "full",
        [FromQuery] string? ids = null,
        [FromQuery] long? reportId = null,
        [FromQuery] long? crawlRunId = null,
        CancellationToken cancellationToken = default)
    {
        if (!PortfolioConstants.ValidWidgets.Contains(widget))
            return StatusCode(StatusCodes.Status400BadRequest, new { detail = "Invalid widget" });

        if (widget.Equals("card", StringComparison.OrdinalIgnoreCase) &&
            reportId is null && crawlRunId is null)
        {
            return StatusCode(StatusCodes.Status400BadRequest,
                new { detail = "reportId or crawlRunId required for card widget" });
        }

        var idList = ParseIds(ids);
        var result = await _portfolio.GetPortfolioResponseAsync(
            widget, idList, reportId, crawlRunId, cancellationToken);
        return Ok(result);
    }

    private static List<long> ParseIds(string? ids)
    {
        if (string.IsNullOrWhiteSpace(ids)) return [];
        var list = new List<long>();
        foreach (var part in ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (long.TryParse(part, out var n) && n > 0)
                list.Add(n);
        }
        return list;
    }
}
