using CoreService.Api.DataApplication.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

[ApiController]
[Route("api/backlinks")]
[Tags("Backlinks")]
public sealed class BacklinksController(IBacklinksRepository backlinks) : ControllerBase
{
    [HttpGet("velocity")]
    public async Task<IActionResult> Velocity(
        [FromQuery] long propertyId,
        CancellationToken cancellationToken)
    {
        if (propertyId <= 0)
        {
            return BadRequest(new { detail = "propertyId required" });
        }

        var snapshots = await backlinks.ListVelocityAsync(propertyId, cancellationToken);
        return Ok(new { snapshots });
    }
}
