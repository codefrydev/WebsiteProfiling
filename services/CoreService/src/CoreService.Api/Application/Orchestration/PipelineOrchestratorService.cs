using CoreService.Api.Application.Build;
using CoreService.Api.Application.Pipeline;

namespace CoreService.Api.Application.Orchestration;

/// <summary>
/// Full-audit orchestrator: enqueue crawl+lighthouse on C# worker, poll job, then build report.
/// </summary>
public sealed class PipelineOrchestratorService(
    PipelineRunService pipelineRunService,
    PipelineJobRepository pipelineJobs,
    ReportBuildService reportBuildService)
{
    public async Task<OrchestratorResult> RunFullAuditAsync(
        OrchestratorRunRequest request,
        CancellationToken cancellationToken = default)
    {
        var state = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (request.State is not null)
        {
            foreach (var (key, value) in request.State)
            {
                state[key] = value;
            }
        }

        state[PipelineStateHelper.Flags.RunReport] = "false";

        var enqueue = await pipelineRunService.EnqueueRunAsync(
            request.Command,
            state,
            request.PropertyId,
            cancellationToken);

        if (!enqueue.Success || string.IsNullOrWhiteSpace(enqueue.JobId))
        {
            return new OrchestratorResult(false, enqueue.JobId, enqueue.Error, enqueue.Error ?? "Failed to enqueue crawl job");
        }

        var jobId = enqueue.JobId;
        var deadline = DateTime.UtcNow.AddMinutes(request.TimeoutMinutes);
        while (DateTime.UtcNow < deadline)
        {
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
            var job = await pipelineJobs.GetAsync(jobId, cancellationToken);
            if (job is null)
            {
                continue;
            }

            if (job.Status is "success" or "error" or "paused")
            {
                if (!string.Equals(job.Status, "success", StringComparison.OrdinalIgnoreCase))
                {
                    return new OrchestratorResult(
                        false,
                        jobId,
                        job.Log,
                        $"Crawl job ended with status {job.Status}");
                }

                break;
            }
        }

        if (DateTime.UtcNow >= deadline)
        {
            return new OrchestratorResult(false, jobId, null, "Crawl job timed out");
        }

        var build = await reportBuildService.BuildAsync(
            request.PropertyId,
            request.CrawlRunId,
            request.State,
            request.RunKeywordEnrich,
            cancellationToken);

        return new OrchestratorResult(build.Ok, jobId, build.RawBody, build.Ok ? null : build.Log);
    }
}

public sealed record OrchestratorRunRequest
{
    public required long PropertyId { get; init; }

    public string? Command { get; init; }

    public long? CrawlRunId { get; init; }

    public Dictionary<string, string>? State { get; init; }

    public bool RunKeywordEnrich { get; init; } = true;

    public int TimeoutMinutes { get; init; } = 120;
}

public sealed record OrchestratorResult(bool Ok, string? JobId, string? Detail, string? Error);
