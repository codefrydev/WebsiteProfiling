using Data.Application.Python;
using Microsoft.AspNetCore.Mvc;

namespace Data.Api.Controllers;

[ApiController]
[Route("api/alerts")]
[Tags("Alerts")]
public sealed class AlertsController(DataPythonRunner python) : ControllerBase
{
    [HttpPost("check")]
    public async Task<IActionResult> Check(
        [FromQuery] long propertyId,
        CancellationToken cancellationToken)
    {
        if (propertyId <= 0)
        {
            return BadRequest(new { detail = "propertyId required" });
        }

        try
        {
            var result = await python.RunAlertsAsync(propertyId, cancellationToken);
            return Ok(result.Payload ?? new Dictionary<string, object?> { ["ok"] = true, ["checked"] = 0 });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { detail = ex.Message });
        }
    }
}
