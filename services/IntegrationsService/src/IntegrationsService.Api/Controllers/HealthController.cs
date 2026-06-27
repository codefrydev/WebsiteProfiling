using Microsoft.AspNetCore.Mvc;

namespace IntegrationsService.Api.Controllers;

[ApiController]
[Route("")]
[Tags("Health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet("health")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult Get() => Ok(new { status = "ok" });
}
