using CoreService.Api.Application.Compare;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

[ApiController]
[Route("api/compare")]
[Tags("Compare")]
public sealed class CompareController(CompareExportService compare) : ControllerBase
{
    [HttpPost("export")]
    public async Task<IActionResult> Export(
        [FromBody] CompareExportBody body,
        CancellationToken cancellationToken)
    {
        if (body.ReportIdA is null or <= 0 || body.ReportIdB is null or <= 0)
        {
            return BadRequest(new { detail = "reportIdA and reportIdB required" });
        }

        var (found, csv) = await compare.ExportAsync(body.ReportIdA.Value, body.ReportIdB.Value, cancellationToken);
        if (!found)
        {
            return NotFound(new { detail = "One or both reports not found" });
        }

        return File(
            System.Text.Encoding.UTF8.GetBytes(csv),
            "text/csv",
            "compare_export.csv");
    }
}

public sealed class CompareExportBody
{
    public long? ReportIdA { get; init; }

    public long? ReportIdB { get; init; }
}
