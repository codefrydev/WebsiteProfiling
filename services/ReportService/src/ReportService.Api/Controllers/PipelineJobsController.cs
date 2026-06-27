using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using ReportService.Application.Pipeline;
using WebsiteProfiling.Contracts.Config;

namespace ReportService.Api.Controllers;

[ApiController]
[Route("api")]
[Tags("Pipeline")]
public sealed class PipelineJobsController(
    PipelineRunService runService,
    PipelineJobRepository jobs) : ControllerBase
{
    [HttpPost("run")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Run([FromBody] RunPostBody body, CancellationToken cancellationToken)
    {
        var result = await runService.EnqueueRunAsync(
            body.Command,
            body.State,
            body.PropertyId,
            cancellationToken);
        if (!result.Success)
        {
            return BadRequest(ApiErrorBodies.BadRequest(result.Error ?? "Run failed"));
        }

        return Ok(new { jobId = result.JobId });
    }

    [HttpGet("jobs")]
    public async Task<IActionResult> ListJobs([FromQuery] int limit = 20, CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 100);
        var reconciled = await jobs.ReconcileStaleJobsAsync(cancellationToken);
        var active = await jobs.GetActiveAsync(cancellationToken);
        var jobList = await jobs.ListAsync(limit, cancellationToken);
        return Ok(new
        {
            jobs = jobList.Select(jobs.JobToApiObject).ToList(),
            active = active is null ? null : jobs.JobToApiObject(active),
            reconciled,
        });
    }

    [HttpGet("jobs/{jobId:guid}")]
    public async Task<IActionResult> GetJob(string jobId, CancellationToken cancellationToken)
    {
        var job = await jobs.GetAsync(jobId, cancellationToken);
        if (job is null)
        {
            return NotFound(ApiErrorBodies.NotFound("Job not found"));
        }

        return Ok(jobs.JobStatusToApiObject(job));
    }

    [HttpPost("jobs/{jobId:guid}/cancel")]
    public async Task<IActionResult> CancelJob(string jobId, CancellationToken cancellationToken)
    {
        var job = await jobs.GetAsync(jobId, cancellationToken);
        if (job is null)
        {
            return NotFound(ApiErrorBodies.NotFound("Job not found"));
        }

        if (job.Status is not ("pending" or "running"))
        {
            return Conflict(ApiErrorBodies.Conflict("Job is not running"));
        }

        if (!await jobs.CancelJobAsync(jobId, cancellationToken: cancellationToken))
        {
            return Conflict(ApiErrorBodies.Conflict("Job is not running"));
        }

        return Ok(new { ok = true, status = "error" });
    }

    [HttpPost("jobs/{jobId:guid}/pause")]
    public async Task<IActionResult> PauseJob(string jobId, CancellationToken cancellationToken)
    {
        var job = await jobs.GetAsync(jobId, cancellationToken);
        if (job is null)
        {
            return NotFound(ApiErrorBodies.NotFound("Job not found"));
        }

        if (!string.Equals(job.Status, "running", StringComparison.OrdinalIgnoreCase))
        {
            return Conflict(ApiErrorBodies.Conflict("Job is not running"));
        }

        await jobs.SetPauseFlagAsync(jobId, cancellationToken);
        return Ok(new { ok = true });
    }

    [HttpPost("jobs/{jobId:guid}/resume")]
    public async Task<IActionResult> ResumeJob(string jobId, CancellationToken cancellationToken)
    {
        var result = await runService.ResumeJobAsync(jobId, cancellationToken);
        if (result.NotFound)
        {
            return NotFound(ApiErrorBodies.NotFound(result.Error ?? "Job not found"));
        }

        if (result.Conflict)
        {
            return Conflict(ApiErrorBodies.Conflict(result.Error ?? "Conflict"));
        }

        if (!result.Success)
        {
            return BadRequest(ApiErrorBodies.BadRequest(result.Error ?? "Resume failed"));
        }

        return Ok(new { ok = true, newJobId = result.NewJobId });
    }
}

public sealed class RunPostBody
{
    public string? Command { get; init; }

    public Dictionary<string, object?>? State { get; init; }

    public long? PropertyId { get; init; }
}
