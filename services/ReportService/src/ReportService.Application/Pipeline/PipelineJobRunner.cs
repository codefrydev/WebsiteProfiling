using System.Collections;
using System.Diagnostics;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportService.Application.Bridge;
using ReportService.Application.Build;
using ReportService.Application.Options;
using ReportService.Application.Pipeline.Models;

namespace ReportService.Application.Pipeline;

public sealed class PipelineJobRunner(
    PipelineJobRepository jobs,
    PipelineConfigRepository configRepository,
    ReportBuildService reportBuildService,
    FastApiPythonBridge fastApiBridge,
    IOptions<WorkerOptions> workerOptions,
    ILogger<PipelineJobRunner> logger)
{
    public async Task RunAsync(ClaimedPipelineJob job, CancellationToken cancellationToken = default)
    {
        if (IsInProcessReportCommand(job.Command, job.JobType))
        {
            await RunReportInProcessAsync(job, cancellationToken);
            return;
        }

        await RunSubprocessAsync(job, cancellationToken);
    }

    private static bool IsInProcessReportCommand(string? command, string jobType)
    {
        var baseCmd = PipelineStateHelper.CommandBase(command);
        return string.Equals(baseCmd, "report", StringComparison.OrdinalIgnoreCase)
               || string.Equals(jobType, "report", StringComparison.OrdinalIgnoreCase);
    }

    private async Task RunReportInProcessAsync(ClaimedPipelineJob job, CancellationToken cancellationToken)
    {
        if (job.PropertyId is not > 0)
        {
            await jobs.FinishAsync(job.Id, "error", 1, "property_id required for report build", cancellationToken: cancellationToken);
            return;
        }

        if (!await jobs.IsActiveAsync(job.Id, cancellationToken))
        {
            return;
        }

        try
        {
            await jobs.AppendLogAsync(job.Id, "\n[Report] Native report build starting...\n", cancellationToken);
            var cfg = await configRepository.ReadPipelineConfigAsync(cancellationToken);
            cfg["active_property_id"] = job.PropertyId.Value.ToString();
            var result = await reportBuildService.BuildAsync(
                job.PropertyId.Value,
                crawlRunId: null,
                cfg,
                runKeywordEnrich: true,
                cancellationToken);
            await jobs.AppendLogAsync(job.Id, $"\n[Report] Done. Log: {result.Log}\n", cancellationToken);
            if (result.Ok)
            {
                await jobs.FinishAsync(job.Id, "success", result.ExitCode, cancellationToken: cancellationToken);
            }
            else
            {
                await jobs.FinishAsync(job.Id, "error", result.ExitCode, result.Log, cancellationToken: cancellationToken);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "In-process report build failed for job {JobId}", job.Id);
            await jobs.AppendLogAsync(job.Id, $"\n[Report] Failed: {ex.Message}\n", cancellationToken);
            await jobs.FinishAsync(job.Id, "error", 1, ex.Message, cancellationToken: cancellationToken);
        }
    }

    private async Task RunSubprocessAsync(ClaimedPipelineJob job, CancellationToken cancellationToken)
    {
        var options = workerOptions.Value;
        var repoRoot = ResolveRepoRoot(options);
        var pythonExe = ResolvePythonExecutable(options);
        var hasLocalPython = File.Exists(pythonExe) || IsExecutableOnPath(pythonExe);

        if (!hasLocalPython)
        {
            await RunBridgedSubprocessAsync(job, options, cancellationToken);
            return;
        }

        var args = BuildProcessArgs(pythonExe, job.Command);
        var env = BuildSpawnEnvironment(repoRoot, options, job.PropertyId);

        Process? process = null;
        try
        {
            process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = args[0],
                    WorkingDirectory = repoRoot,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                },
                EnableRaisingEvents = true,
            };

            for (var i = 1; i < args.Length; i++)
            {
                process.StartInfo.ArgumentList.Add(args[i]);
            }

            foreach (var (key, value) in env)
            {
                process.StartInfo.Environment[key] = value;
            }

            process.Start();
            PipelineProcessRegistry.Register(job.Id, process);
        }
        catch (Exception ex)
        {
            await jobs.FinishAsync(job.Id, "error", -1, ex.Message, cancellationToken: cancellationToken);
            return;
        }

        try
        {
            using (process)
            {
                var stdoutPump = PumpStreamAsync(process.StandardOutput, job.Id, cancellationToken);
                var stderrPump = PumpStreamAsync(process.StandardError, job.Id, cancellationToken);
                var paused = false;

                while (!process.HasExited)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
                    var (cancel, pause) = await jobs.CheckFlagsAsync(job.Id, cancellationToken);
                    if (cancel)
                    {
                        TryKillProcess(process);
                        await process.WaitForExitAsync(cancellationToken);
                        await Task.WhenAll(stdoutPump, stderrPump);
                        await jobs.FinishAsync(job.Id, "error", -1, "Cancelled by user", cancellationToken: cancellationToken);
                        return;
                    }

                    if (pause && !paused)
                    {
                        TryPauseProcess(process);
                        paused = true;
                    }
                }

                await process.WaitForExitAsync(cancellationToken);
                await Task.WhenAll(stdoutPump, stderrPump);

                var exitCode = process.ExitCode;
                if (paused && exitCode == 0)
                {
                    var logTruncated = await jobs.GetLogTruncatedAsync(job.Id, cancellationToken);
                    await jobs.FinishAsync(job.Id, "paused", exitCode, logTruncated: logTruncated, cancellationToken: cancellationToken);
                    return;
                }

                if (exitCode == 0 && ShouldPostCrawlReport(job, options))
                {
                    if (await jobs.IsActiveAsync(job.Id, cancellationToken))
                    {
                        await FinishAfterPostCrawlReportAsync(job, cancellationToken);
                    }

                    return;
                }

                var status = exitCode == 0 ? "success" : "error";
                var error = exitCode == 0 ? null : $"Process exited with code {exitCode}";
                await jobs.FinishAsync(job.Id, status, exitCode, error, cancellationToken: cancellationToken);
            }
        }
        finally
        {
            PipelineProcessRegistry.Unregister(job.Id);
        }
    }

    private async Task RunBridgedSubprocessAsync(
        ClaimedPipelineJob job,
        WorkerOptions options,
        CancellationToken cancellationToken)
    {
        var result = await fastApiBridge.ExecuteClaimedSubprocessAsync(
            job.Id,
            job.Command,
            job.PropertyId,
            cancellationToken);

        if (!result.Ok)
        {
            await jobs.FinishAsync(
                job.Id,
                "error",
                -1,
                result.Error ?? "FastAPI subprocess bridge failed",
                cancellationToken: cancellationToken);
            return;
        }

        if (result.Cancelled)
        {
            await jobs.FinishAsync(job.Id, "error", -1, "Cancelled by user", cancellationToken: cancellationToken);
            return;
        }

        if (result.Paused)
        {
            var logTruncated = await jobs.GetLogTruncatedAsync(job.Id, cancellationToken);
            await jobs.FinishAsync(
                job.Id,
                "paused",
                result.ExitCode,
                logTruncated: logTruncated,
                cancellationToken: cancellationToken);
            return;
        }

        if (result.ExitCode == 0 && ShouldPostCrawlReport(job, options))
        {
            if (await jobs.IsActiveAsync(job.Id, cancellationToken))
            {
                await FinishAfterPostCrawlReportAsync(job, cancellationToken);
            }

            return;
        }

        var status = result.ExitCode == 0 ? "success" : "error";
        var error = result.ExitCode == 0 ? null : $"Process exited with code {result.ExitCode}";
        await jobs.FinishAsync(job.Id, status, result.ExitCode, error, cancellationToken: cancellationToken);
    }

    private async Task FinishAfterPostCrawlReportAsync(ClaimedPipelineJob job, CancellationToken cancellationToken)
    {
        if (!await jobs.IsActiveAsync(job.Id, cancellationToken))
        {
            return;
        }

        if (job.PropertyId is not > 0)
        {
            await jobs.FinishAsync(job.Id, "success", 0, cancellationToken: cancellationToken);
            return;
        }

        try
        {
            await jobs.AppendLogAsync(job.Id, "\n[Report] Post-crawl report build starting...\n", cancellationToken);
            var cfg = await configRepository.ReadPipelineConfigAsync(cancellationToken);
            cfg["active_property_id"] = job.PropertyId.Value.ToString();
            var result = await reportBuildService.BuildAsync(
                job.PropertyId.Value,
                crawlRunId: null,
                cfg,
                runKeywordEnrich: true,
                cancellationToken);
            await jobs.AppendLogAsync(job.Id, $"\n[Report] Done. Log: {result.Log}\n", cancellationToken);
            if (result.Ok)
            {
                await jobs.FinishAsync(job.Id, "success", 0, cancellationToken: cancellationToken);
            }
            else
            {
                await jobs.FinishAsync(job.Id, "error", result.ExitCode, result.Log, cancellationToken: cancellationToken);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Post-crawl report failed for job {JobId}", job.Id);
            await jobs.AppendLogAsync(job.Id, $"\n[Report] Failed: {ex.Message}\n", cancellationToken);
            await jobs.FinishAsync(job.Id, "error", 1, ex.Message, cancellationToken: cancellationToken);
        }
    }

    private static bool ShouldPostCrawlReport(ClaimedPipelineJob job, WorkerOptions options)
    {
        if (!options.PostCrawlReportBuild || job.PropertyId is null)
        {
            return false;
        }

        var baseCmd = PipelineStateHelper.CommandBase(job.Command);
        if (baseCmd is not (null or "" or "crawl"))
        {
            return false;
        }

        return true;
    }

    private async Task PumpStreamAsync(StreamReader reader, string jobId, CancellationToken cancellationToken)
    {
        var buffer = new char[4096];
        while (!reader.EndOfStream)
        {
            var read = await reader.ReadAsync(buffer, cancellationToken);
            if (read <= 0)
            {
                break;
            }

            var text = new string(buffer, 0, read);
            try
            {
                await jobs.AppendLogAsync(jobId, text, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to append job log for {JobId}", jobId);
            }
        }
    }

    private static string[] BuildProcessArgs(string pythonExe, string? command)
    {
        var args = new List<string> { pythonExe, "-m", "src" };
        if (!string.IsNullOrWhiteSpace(command))
        {
            args.AddRange(command.Split(' ', StringSplitOptions.RemoveEmptyEntries));
        }

        return args.ToArray();
    }

    private static Dictionary<string, string> BuildSpawnEnvironment(
        string repoRoot,
        WorkerOptions options,
        long? propertyId)
    {
        var env = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
        {
            if (entry.Key is string key && entry.Value is string value)
            {
                env[key] = value;
            }
        }

        var dataDir = string.IsNullOrWhiteSpace(options.DataDir)
            ? Path.Combine(repoRoot, "data")
            : options.DataDir;
        env["WEBSITE_PROFILING_ROOT"] = repoRoot;
        env["DATA_DIR"] = dataDir;
        var srcPath = Path.Combine(repoRoot, "src");
        env["PYTHONPATH"] = env.TryGetValue("PYTHONPATH", out var existing) && !string.IsNullOrEmpty(existing)
            ? $"{srcPath}{Path.PathSeparator}{existing}"
            : srcPath;
        env["PYTHONIOENCODING"] = "utf-8";
        env["PYTHONUTF8"] = "1";
        env["PIPELINE_ORCHESTRATE_VIA_REPORT_SERVICE"] = "1";
        if (propertyId is not null)
        {
            env["WP_PROPERTY_ID"] = propertyId.Value.ToString();
        }

        return env;
    }

    private static string ResolveRepoRoot(WorkerOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.RepoRoot))
        {
            return options.RepoRoot;
        }

        var fromEnv = Environment.GetEnvironmentVariable("WEBSITE_PROFILING_ROOT");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv;
        }

        var dir = AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            if (File.Exists(Path.Combine(dir, "config", "typed_config_manifest.json")))
            {
                return dir;
            }

            dir = Directory.GetParent(dir)?.FullName ?? "";
        }

        return Directory.GetCurrentDirectory();
    }

    private static string ResolvePythonExecutable(WorkerOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.PythonExecutable))
        {
            return options.PythonExecutable;
        }

        var fromEnv = Environment.GetEnvironmentVariable("PYTHON");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv;
        }

        return OperatingSystem.IsWindows() ? "python" : "python3";
    }

    private static bool IsExecutableOnPath(string executable)
    {
        if (executable.Contains('/') || executable.Contains('\\'))
        {
            return false;
        }

        var path = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        var extensions = OperatingSystem.IsWindows()
            ? (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT").Split(';')
            : [""];

        foreach (var dir in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            foreach (var ext in extensions)
            {
                var candidate = Path.Combine(dir.Trim(), executable + ext);
                if (File.Exists(candidate))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static void TryKillProcess(Process process)
    {
        try
        {
            process.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException)
        {
            // already exited
        }
    }

    private static void TryPauseProcess(Process process)
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "powershell",
                    Arguments = $"-Command \"Suspend-Process -Id {process.Id}\"",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                })?.WaitForExit(5000);
            }
            else
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "kill",
                    Arguments = $"-STOP {process.Id}",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                })?.WaitForExit(5000);
            }
        }
        catch
        {
            // pause is best-effort
        }
    }
}
