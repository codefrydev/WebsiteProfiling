using IntegrationsService.Application.Report;
using Microsoft.AspNetCore.Mvc;

namespace IntegrationsService.Api.Controllers.Internal;

[ApiController]
[Route("internal/integrations/report")]
[Tags("Internal")]
public sealed class ReportEnrichmentController(ReportEnrichmentService enrichment) : ControllerBase
{
    [HttpGet("enrichment")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetEnrichment(
        [FromQuery] long propertyId,
        CancellationToken cancellationToken)
    {
        if (propertyId <= 0)
        {
            return BadRequest(new { error = "propertyId is required" });
        }

        var bundle = await enrichment.ReadForReportAsync(propertyId, cancellationToken);
        return Ok(new
        {
            google = bundle.Google,
            keywords = bundle.Keywords,
            gscLinks = bundle.GscLinks,
        });
    }
}
