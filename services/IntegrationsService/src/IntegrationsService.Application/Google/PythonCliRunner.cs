using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace IntegrationsService.Application.Google;

public sealed class PythonCliRunner
{
    public async Task<PythonCliResult> RunAsync(
        IReadOnlyList<string> arguments,
        string? stdin = null,
        IReadOnlyDictionary<string, string>? environment = null,
        int timeoutSeconds = 45,
        CancellationToken cancellationToken = default)
    {
        var python = ResolvePythonExecutable();
        var repoRoot = ResolveRepoRoot();
        var psi = new ProcessStartInfo
        {
            FileName = python,
            WorkingDirectory = repoRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = stdin is not null,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        foreach (var arg in arguments)
        {
            psi.ArgumentList.Add(arg);
        }

        if (environment is not null)
        {
            foreach (var (key, value) in environment)
            {
                psi.Environment[key] = value;
            }
        }

        using var process = new Process { StartInfo = psi };
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not null)
            {
                stdout.AppendLine(e.Data);
            }
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null)
            {
                stderr.AppendLine(e.Data);
            }
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        if (stdin is not null)
        {
            await process.StandardInput.WriteAsync(stdin);
            process.StandardInput.Close();
        }

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        try
        {
            await process.WaitForExitAsync(timeoutCts.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch
            {
                // ignore kill failures on timeout
            }

            return new PythonCliResult(-1, stdout.ToString(), stderr.ToString(), TimedOut: true);
        }

        return new PythonCliResult(process.ExitCode, stdout.ToString(), stderr.ToString());
    }

    public async Task<JsonDocument?> RunJsonFromLastLineAsync(
        IReadOnlyList<string> arguments,
        string? stdin = null,
        IReadOnlyDictionary<string, string>? environment = null,
        int timeoutSeconds = 45,
        CancellationToken cancellationToken = default)
    {
        var result = await RunAsync(arguments, stdin, environment, timeoutSeconds, cancellationToken);
        var lines = result.Stdout
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var last = lines.Length > 0 ? lines[^1] : "{}";
        try
        {
            return JsonDocument.Parse(last);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string ResolvePythonExecutable() =>
        (Environment.GetEnvironmentVariable("PYTHON_EXECUTABLE")
         ?? Environment.GetEnvironmentVariable("PYTHON")
         ?? "python3").Trim();

    private static string ResolveRepoRoot()
    {
        var env = Environment.GetEnvironmentVariable("WEBSITE_PROFILING_ROOT");
        if (!string.IsNullOrWhiteSpace(env))
        {
            return env.Trim();
        }

        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "pyproject.toml"))
                || Directory.Exists(Path.Combine(dir.FullName, "src", "website_profiling")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        return Directory.GetCurrentDirectory();
    }
}

public sealed record PythonCliResult(
    int ExitCode,
    string Stdout,
    string Stderr,
    bool TimedOut = false);
