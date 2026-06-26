using System.Text.Json;
using ReportService.Application.Bridge;
using ReportService.Application.Build;

namespace ReportService.Application.Orchestration;

/// <summary>
/// Full-audit orchestrator: enqueue crawl+lighthouse on Python worker, poll job, then build report.
/// </summary>
public sealed class PipelineOrchestratorService(
    FastApiPythonBridge bridge,
    ReportBuildService reportBuildService)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public async Task<OrchestratorResult> RunFullAuditAsync(
        OrchestratorRunRequest request,
        CancellationToken cancellationToken = default)
    {
        var state = new Dictionary<string, string>(request.State ?? new Dictionary<string, string>(), StringComparer.Ordinal)
        {
            ["run_report"] = "false",
        };

        var enqueue = await bridge.EnqueuePipelineRunAsync(
            new
            {
                command = request.Command,
                propertyId = request.PropertyId,
                state,
            },
            cancellationToken);

        if (!enqueue.Ok || string.IsNullOrWhiteSpace(enqueue.JobId))
        {
            return new OrchestratorResult(false, enqueue.JobId, enqueue.RawBody, "Failed to enqueue crawl job");
        }

        var jobId = enqueue.JobId;
        var deadline = DateTime.UtcNow.AddMinutes(request.TimeoutMinutes);
        while (DateTime.UtcNow < deadline)
        {
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
            using var jobDoc = await bridge.GetJobAsync(jobId, cancellationToken);
            if (jobDoc is null)
            {
                continue;
            }

            var status = jobDoc.RootElement.TryGetProperty("status", out var st) ? st.GetString() : null;
            if (status is "done" or "error" or "cancelled")
            {
                if (status != "done")
                {
                    return new OrchestratorResult(false, jobId, jobDoc.RootElement.GetRawText(), $"Crawl job ended with status {status}");
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
