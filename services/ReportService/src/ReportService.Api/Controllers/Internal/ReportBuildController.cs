using Microsoft.AspNetCore.Mvc;
using ReportService.Application.Build;

namespace ReportService.Api.Controllers.Internal;

[ApiController]
[Route("internal/report")]
[Tags("Internal")]
public sealed class ReportBuildController(ReportBuildService reportBuildService) : ControllerBase
{
    [HttpPost("build")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Build(
        [FromBody] ReportBuildRequestBody body,
        CancellationToken cancellationToken)
    {
        if (body.PropertyId <= 0)
        {
            return BadRequest(new { error = "propertyId is required" });
        }

        var result = await reportBuildService.BuildAsync(
            body.PropertyId,
            body.CrawlRunId,
            body.Config,
            body.RunKeywordEnrich,
            cancellationToken);

        return Ok(new
        {
            ok = result.Ok,
            exitCode = result.ExitCode,
            log = result.Log,
            outputPath = result.OutputPath,
        });
    }
}

public sealed class ReportBuildRequestBody
{
    public long PropertyId { get; init; }

    public long? CrawlRunId { get; init; }

    public Dictionary<string, string>? Config { get; init; }

    public bool RunKeywordEnrich { get; init; } = true;
}
