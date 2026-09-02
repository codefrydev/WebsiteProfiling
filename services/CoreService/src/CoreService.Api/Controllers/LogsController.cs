using CoreService.Api.DataApplication.Python;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

[ApiController]
[Route("api/logs")]
[Tags("Logs")]
public sealed class LogsController(DataPythonRunner python) : ControllerBase
{
    [HttpPost("upload")]
    [RequestSizeLimit(100_000_000)]
    public async Task<IActionResult> Upload(
        [FromForm] long propertyId,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        if (propertyId <= 0)
        {
            return BadRequest(new { detail = "propertyId required" });
        }

        await using var stream = file.OpenReadStream();
        using var reader = new StreamReader(stream);
        var content = await reader.ReadToEndAsync(cancellationToken);

        try
        {
            var result = await python.RunLogUploadAsync(propertyId, content, cancellationToken);
            if (!result.Ok && result.Error == "Log analysis module unavailable")
            {
                return StatusCode(StatusCodes.Status501NotImplemented, new { detail = result.Error });
            }

            if (!result.Ok)
            {
                return StatusCode(500, new { detail = result.Error ?? "Log upload failed" });
            }

            return Ok((object?)result.Payload ?? new Dictionary<string, object?> { ["ok"] = true });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { detail = ex.Message });
        }
    }
}
