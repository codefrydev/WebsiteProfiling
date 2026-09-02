using CoreService.Api.Application.Orchestration;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers.Internal;

[ApiController]
[Route("internal/pipeline")]
[Tags("Internal")]
public sealed class PipelineOrchestratorController(PipelineOrchestratorService orchestrator) : ControllerBase
{
    [HttpPost("run")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Run(
        [FromBody] PipelineRunRequestBody body,
        CancellationToken cancellationToken)
    {
        if (body.PropertyId <= 0)
        {
            return BadRequest(new { error = "propertyId is required" });
        }

        var result = await orchestrator.RunFullAuditAsync(
            new OrchestratorRunRequest
            {
                PropertyId = body.PropertyId,
                Command = body.Command,
                CrawlRunId = body.CrawlRunId,
                State = body.State,
                RunKeywordEnrich = body.RunKeywordEnrich,
                TimeoutMinutes = body.TimeoutMinutes > 0 ? body.TimeoutMinutes : 120,
            },
            cancellationToken);

        if (!result.Ok)
        {
            return BadRequest(new { ok = false, jobId = result.JobId, error = result.Error, detail = result.Detail });
        }

        return Ok(new { ok = true, jobId = result.JobId, detail = result.Detail });
    }
}

public sealed class PipelineRunRequestBody
{
    public long PropertyId { get; init; }

    public string? Command { get; init; }

    public long? CrawlRunId { get; init; }

    public Dictionary<string, string>? State { get; init; }

    public bool RunKeywordEnrich { get; init; } = true;

    public int TimeoutMinutes { get; init; } = 120;
}
