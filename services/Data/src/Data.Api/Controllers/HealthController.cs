using Microsoft.AspNetCore.Mvc;

namespace Data.Api.Controllers;

[ApiController]
[Route("")]
[Tags("Health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet("health")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult Get() => Ok(new { status = "ok" });
}
