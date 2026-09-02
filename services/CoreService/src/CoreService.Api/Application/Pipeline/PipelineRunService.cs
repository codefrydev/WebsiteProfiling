namespace CoreService.Api.Application.Pipeline;

public sealed class PipelineRunService(
    PipelineJobRepository jobs,
    PipelineConfigRepository configRepository,
    PipelinePropertyRepository propertyRepository)
{
    public async Task<PipelineRunResult> EnqueueRunAsync(
        string? command,
        Dictionary<string, object?>? rawState,
        long? propertyId,
        CancellationToken cancellationToken = default)
    {
        var commandBase = PipelineStateHelper.CommandBase(command);
        if (commandBase is not null
            && !PipelineStateHelper.AllowedCommands.Contains(commandBase))
        {
            return PipelineRunResult.Fail($"Invalid command: {commandBase}");
        }

        Dictionary<string, string> state;
        if (rawState is null || rawState.Count == 0)
        {
            try
            {
                state = await configRepository.ReadPipelineConfigAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                return PipelineRunResult.Fail($"Missing state and could not load config: {ex.Message}");
            }
        }
        else
        {
            state = PipelineStateHelper.CoercePipelineState(rawState);
        }

        if (state.Count == 0)
        {
            return PipelineRunResult.Fail("Missing state object");
        }

        var startUrl = state.GetValueOrDefault("start_url")?.Trim() ?? "";
        if (!string.IsNullOrEmpty(startUrl))
        {
            try
            {
                var ensured = await propertyRepository.EnsurePropertyFromStartUrlAsync(startUrl, cancellationToken);
                propertyId ??= ensured;
            }
            catch
            {
                // property resolution is best-effort
            }

            state["active_property_id"] = (propertyId ?? 0).ToString();
        }

        var errors = PipelineStateHelper.ValidatePipelineRun(state, command);
        if (errors.Count > 0)
        {
            return PipelineRunResult.Fail(string.Join(' ', errors));
        }

        try
        {
            await configRepository.SavePipelineConfigAsync(state, cancellationToken);
        }
        catch (Exception ex)
        {
            return PipelineRunResult.Fail($"Failed to save config: {ex.Message}");
        }

        var jobId = Guid.NewGuid().ToString();
        var jobType = commandBase ?? "full";
        try
        {
            var ok = await jobs.EnqueueAsync(jobId, jobType, command, propertyId, cancellationToken: cancellationToken);
            if (!ok)
            {
                return PipelineRunResult.Fail("An audit job is already running");
            }
        }
        catch (Exception ex)
        {
            return PipelineRunResult.Fail(ex.Message);
        }

        return PipelineRunResult.Ok(jobId);
    }

    public async Task<PipelineResumeResult> ResumeJobAsync(string jobId, CancellationToken cancellationToken = default)
    {
        var job = await jobs.GetAsync(jobId, cancellationToken);
        if (job is null)
        {
            return PipelineResumeResult.JobNotFound();
        }

        if (!string.Equals(job.Status, "paused", StringComparison.OrdinalIgnoreCase))
        {
            return PipelineResumeResult.JobConflict("Job is not paused");
        }

        // The crawler logs this lowercase ("[PAUSE] crawl_run_id={id}", see crawl/crawler.py) —
        // match case-insensitively rather than assuming a specific casing.
        var match = System.Text.RegularExpressions.Regex.Match(
            job.Log ?? "", @"crawl_run_id=(\d+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!match.Success)
        {
            return PipelineResumeResult.JobConflict("No paused crawl run found for this job");
        }

        var pausedRunId = match.Groups[1].Value;
        var resumeCommand = $"--resume-run-id {pausedRunId}";
        var newJobId = Guid.NewGuid().ToString();
        var ok = await jobs.EnqueueAsync(
            newJobId,
            "crawl-resume",
            resumeCommand,
            job.PropertyId,
            cancellationToken: cancellationToken);
        if (!ok)
        {
            return PipelineResumeResult.Fail("An audit job is already running");
        }

        return PipelineResumeResult.Ok(newJobId);
    }
}

public sealed record PipelineRunResult(bool Success, string? JobId, string? Error)
{
    public static PipelineRunResult Ok(string jobId) => new(true, jobId, null);

    public static PipelineRunResult Fail(string error) => new(false, null, error);
}

public sealed record PipelineResumeResult(bool Success, bool NotFound, bool Conflict, string? NewJobId, string? Error)
{
    public static PipelineResumeResult Ok(string newJobId) => new(true, false, false, newJobId, null);

    public static PipelineResumeResult Fail(string error) => new(false, false, false, null, error);

    public static PipelineResumeResult JobNotFound() => new(false, true, false, null, "Job not found");

    public static PipelineResumeResult JobConflict(string error) => new(false, false, true, null, error);
}
