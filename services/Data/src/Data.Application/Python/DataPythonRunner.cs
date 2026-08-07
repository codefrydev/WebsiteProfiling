using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace Data.Application.Python;

/// <summary>
/// Runs optional Python modules (alerts, log analysis) when the repo source is available locally.
/// </summary>
public sealed class DataPythonRunner
{
    public async Task<ContentScoreResult> RunContentScoreAsync(
        long? propertyId,
        string keyword,
        string bodyHtml,
        string titleTag,
        string metaDescription,
        string? landingUrl,
        CancellationToken cancellationToken)
    {
        var script = """
            import json, sys
            req = json.load(sys.stdin)
            property_id = req.get("propertyId")
            if property_id is not None:
                property_id = int(property_id)
            keyword = str(req.get("keyword") or "").strip()
            if not keyword:
                print(json.dumps({"error": "keyword required"}))
                sys.exit(1)
            from website_profiling.content_studio.score import score_content_draft
            score = score_content_draft(
                property_id,
                keyword,
                req.get("bodyHtml") or "",
                req.get("titleTag") or "",
                req.get("metaDescription") or "",
                req.get("landingUrl"),
            )
            print(json.dumps({"score": score}))
            """;
        var payload = JsonSerializer.Serialize(new
        {
            propertyId,
            keyword,
            bodyHtml,
            titleTag,
            metaDescription,
            landingUrl,
        });
        var result = await RunScriptAsync(script, [], payload, cancellationToken);
        if (result.ExitCode == 2)
        {
            throw new InvalidOperationException("Content score module unavailable");
        }

        if (result.ExitCode != 0)
        {
            var message = TryParseErrorMessage(result.Stdout) ?? result.Stderr.Trim();
            throw new InvalidOperationException(
                message.Length > 0 ? message : "Content score failed");
        }

        var parsed = ParseJsonObject(result.Stdout);
        if (parsed is null || !parsed.TryGetValue("score", out var scoreObj) || scoreObj is null)
        {
            throw new InvalidOperationException("Content score returned no payload");
        }

        if (scoreObj is JsonElement scoreEl && scoreEl.ValueKind == JsonValueKind.Object)
        {
            var scoreDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(scoreEl.GetRawText());
            if (scoreDict is null)
            {
                throw new InvalidOperationException("Content score returned invalid payload");
            }

            return new ContentScoreResult(scoreDict);
        }

        throw new InvalidOperationException("Content score returned invalid payload");
    }

    public async Task<AlertsRunResult> RunAlertsAsync(long propertyId, CancellationToken cancellationToken)
    {
        var script = """
            import json, os, sys
            from psycopg import connect
            conn = connect(os.environ['DATABASE_URL'])
            try:
                from website_profiling.tools.alerts_runner import run_alerts_for_property
                print(json.dumps(run_alerts_for_property(conn, int(sys.argv[1]))))
            except ImportError:
                sys.exit(2)
            """;
        var result = await RunScriptAsync(script, [propertyId.ToString()], null, cancellationToken);
        if (result.ExitCode == 2)
        {
            return new AlertsRunResult(true, new Dictionary<string, object?> { ["ok"] = true, ["checked"] = 0 });
        }

        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(result.Stderr.Trim().Length > 0 ? result.Stderr : result.Stdout);
        }

        var payload = ParseJsonObject(result.Stdout);
        return new AlertsRunResult(true, payload);
    }

    public async Task<LogsUploadResult> RunLogUploadAsync(
        long propertyId,
        string content,
        CancellationToken cancellationToken)
    {
        var script = """
            import json, os, sys
            from psycopg import connect
            conn = connect(os.environ['DATABASE_URL'])
            try:
                from website_profiling.tools.log_analysis import parse_and_store_access_log
                result = parse_and_store_access_log(conn, int(os.environ['PROPERTY_ID']), sys.stdin.read())
                print(json.dumps(result if isinstance(result, dict) else {"ok": True}))
            except ImportError:
                sys.exit(2)
            """;
        var env = new Dictionary<string, string>
        {
            ["PROPERTY_ID"] = propertyId.ToString(),
        };
        var result = await RunScriptAsync(script, [], content, env, cancellationToken);
        if (result.ExitCode == 2)
        {
            return new LogsUploadResult(false, null, "Log analysis module unavailable");
        }

        if (result.ExitCode != 0)
        {
            return new LogsUploadResult(false, null, result.Stderr.Trim().Length > 0 ? result.Stderr : result.Stdout);
        }

        return new LogsUploadResult(true, ParseJsonObject(result.Stdout), null);
    }

    private async Task<PythonRunResult> RunScriptAsync(
        string script,
        IReadOnlyList<string> args,
        string? stdin,
        CancellationToken cancellationToken) =>
        await RunScriptAsync(script, args, stdin, null, cancellationToken);

    private async Task<PythonRunResult> RunScriptAsync(
        string script,
        IReadOnlyList<string> args,
        string? stdin,
        IReadOnlyDictionary<string, string>? extraEnv,
        CancellationToken cancellationToken)
    {
        var repoRoot = ResolveRepoRoot();
        var python = (Environment.GetEnvironmentVariable("PYTHON_EXECUTABLE")
            ?? Environment.GetEnvironmentVariable("PYTHON")
            ?? "python3").Trim();
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
        psi.ArgumentList.Add("-c");
        psi.ArgumentList.Add(script);
        foreach (var arg in args)
        {
            psi.ArgumentList.Add(arg);
        }

        var dbUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
        if (!string.IsNullOrWhiteSpace(dbUrl))
        {
            psi.Environment["DATABASE_URL"] = dbUrl;
        }

        psi.Environment["PYTHONPATH"] = Path.Combine(repoRoot, "src");
        psi.Environment["WEBSITE_PROFILING_ROOT"] = repoRoot;

        if (extraEnv is not null)
        {
            foreach (var (key, value) in extraEnv)
            {
                psi.Environment[key] = value;
            }
        }

        using var process = new Process { StartInfo = psi };
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        process.OutputDataReceived += (_, e) => { if (e.Data is not null) stdout.AppendLine(e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) stderr.AppendLine(e.Data); };
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        if (stdin is not null)
        {
            await process.StandardInput.WriteAsync(stdin);
            process.StandardInput.Close();
        }

        var timeoutSeconds = ResolveTimeoutSeconds();
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        try
        {
            await process.WaitForExitAsync(timeoutCts.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            TryKillProcessTree(process);
            return new PythonRunResult(-1, stdout.ToString(), stderr.ToString(), TimedOut: true);
        }

        return new PythonRunResult(process.ExitCode, stdout.ToString(), stderr.ToString());
    }

    private static int ResolveTimeoutSeconds()
    {
        var raw = Environment.GetEnvironmentVariable("DATA_PYTHON_TIMEOUT_SECONDS");
        return int.TryParse(raw, out var seconds) && seconds > 0 ? seconds : 120;
    }

    private static void TryKillProcessTree(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            // ignore kill failures on timeout
        }
    }

    private static string? TryParseErrorMessage(string stdout)
    {
        try
        {
            var parsed = ParseJsonObject(stdout);
            if (parsed is not null
                && parsed.TryGetValue("error", out var err)
                && err is string message
                && message.Length > 0)
            {
                return message;
            }
        }
        catch (JsonException)
        {
            // ignore malformed stdout
        }

        return null;
    }

    private static Dictionary<string, object?>? ParseJsonObject(string stdout)
    {
        var lines = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var last = lines.Length > 0 ? lines[^1] : "{}";
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(last);
        }
        catch (JsonException)
        {
            return new Dictionary<string, object?> { ["ok"] = true };
        }
    }

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
            if (Directory.Exists(Path.Combine(dir.FullName, "src", "website_profiling")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        return Directory.GetCurrentDirectory();
    }

    private sealed record PythonRunResult(int ExitCode, string Stdout, string Stderr, bool TimedOut = false);
}

public sealed record AlertsRunResult(bool Ok, Dictionary<string, object?>? Payload);

public sealed record LogsUploadResult(bool Ok, Dictionary<string, object?>? Payload, string? Error);

public sealed record ContentScoreResult(Dictionary<string, object?> Payload);
