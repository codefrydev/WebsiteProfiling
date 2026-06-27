using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportService.Application.Options;
using ReportService.Application.Pipeline.Models;

namespace ReportService.Application.Pipeline;

public sealed class PipelineWorkerBackgroundService(
    IServiceScopeFactory scopeFactory,
    IOptions<WorkerOptions> workerOptions,
    ILogger<PipelineWorkerBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!workerOptions.Value.Enabled)
        {
            logger.LogInformation("Pipeline worker disabled (Worker:Enabled=false).");
            return;
        }

        var pollInterval = TimeSpan.FromSeconds(Math.Max(0.2, workerOptions.Value.PollIntervalSeconds));
        logger.LogInformation(
            "C# pipeline worker started (PID {Pid}, poll interval {Interval}s).",
            Environment.ProcessId,
            pollInterval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                ClaimedPipelineJob? claimed;
                await using (var claimScope = scopeFactory.CreateAsyncScope())
                {
                    var jobs = claimScope.ServiceProvider.GetRequiredService<PipelineJobRepository>();
                    claimed = await jobs.TryClaimPendingJobAsync(Environment.ProcessId, stoppingToken);
                }

                if (claimed is null)
                {
                    await Task.Delay(pollInterval, stoppingToken);
                    continue;
                }

                logger.LogInformation("Running job {JobId} (command={Command}).", claimed.Id, claimed.Command);
                await using (var runScope = scopeFactory.CreateAsyncScope())
                {
                    var runner = runScope.ServiceProvider.GetRequiredService<PipelineJobRunner>();
                    var jobs = runScope.ServiceProvider.GetRequiredService<PipelineJobRepository>();
                    try
                    {
                        await runner.RunAsync(claimed, stoppingToken);
                    }
                    finally
                    {
                        if (await jobs.IsActiveAsync(claimed.Id, stoppingToken))
                        {
                            await jobs.FinishAsync(
                                claimed.Id,
                                "error",
                                -1,
                                "Job did not finish cleanly",
                                cancellationToken: stoppingToken);
                        }
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Worker loop error");
                await Task.Delay(pollInterval, stoppingToken);
            }
        }

        logger.LogInformation("C# pipeline worker exiting.");
    }
}
