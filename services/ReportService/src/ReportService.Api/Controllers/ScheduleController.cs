using Microsoft.AspNetCore.Mvc;

namespace ReportService.Api.Controllers;

[ApiController]
[Route("api")]
[Tags("Schedule")]
public sealed class ScheduleController : ControllerBase
{
    [HttpPost("schedule/check")]
    public IActionResult Check() => Ok(new { ok = true, checkedCount = 0 });
}
