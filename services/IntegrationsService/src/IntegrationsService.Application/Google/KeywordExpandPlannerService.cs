using System.Text.Json;
using IntegrationsService.Application.Google;

namespace IntegrationsService.Application.Google;

public sealed class KeywordExpandPlannerService(
    PythonCliRunner python,
    FastApiPythonBridge bridge)
{
    public async Task<(int StatusCode, object? Body)> ExpandAsync(
        string keyword,
        long? propertyId,
        CancellationToken cancellationToken)
    {
        keyword = keyword.Trim();
        if (string.IsNullOrEmpty(keyword))
        {
            return (400, new { detail = "keyword required" });
        }

        if (FastApiPythonBridge.ShouldUseBridge())
        {
            var (status, doc) = await bridge.ForwardJsonPostAsync(
                "/api/integrations/google/keywords/expand",
                new { keyword, propertyId },
                cancellationToken);
            return (status, doc is null ? null : JsonSerializer.Deserialize<object>(doc.RootElement.GetRawText()));
        }

        var script = """
            import json, os, sys
            from psycopg import connect
            conn = connect(os.environ['DATABASE_URL'])
            try:
                from website_profiling.tools.keyword_suggestions import expand_keyword
                result = expand_keyword(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else None, conn)
                print(json.dumps(result if isinstance(result, dict) else {"keywords": result}))
            except ImportError:
                sys.exit(2)
            except Exception as exc:
                print(json.dumps({"error": str(exc)}))
                sys.exit(1)
            """;

        var args = new List<string> { "-c", script, keyword };
        if (propertyId is > 0)
        {
            args.Add(propertyId.Value.ToString());
        }

        return await RunAndParseAsync(args, null, "Keyword expansion unavailable", cancellationToken);
    }

    public async Task<(int StatusCode, object? Body)> PlannerAsync(
        IReadOnlyList<object?> keywords,
        CancellationToken cancellationToken)
    {
        if (keywords.Count == 0 || keywords.Any(k => k is not string))
        {
            return (400, new { detail = "keywords must be a list" });
        }

        if (FastApiPythonBridge.ShouldUseBridge())
        {
            var (status, doc) = await bridge.ForwardJsonPostAsync(
                "/api/integrations/google/keywords/planner",
                new { keywords },
                cancellationToken);
            return (status, doc is null ? null : JsonSerializer.Deserialize<object>(doc.RootElement.GetRawText()));
        }

        var script = """
            import json, os, sys
            from psycopg import connect
            conn = connect(os.environ['DATABASE_URL'])
            payload = json.loads(sys.stdin.read())
            keywords = payload.get("keywords") or []
            try:
                from website_profiling.integrations.google.keyword_planner import fetch_keyword_ideas
                result = fetch_keyword_ideas(conn, keywords)
                print(json.dumps(result if isinstance(result, dict) else {"ideas": result}))
            except ImportError:
                sys.exit(2)
            except Exception as exc:
                print(json.dumps({"error": str(exc)}))
                sys.exit(1)
            """;

        var stdin = JsonSerializer.Serialize(new { keywords });
        return await RunAndParseAsync(["-c", script], stdin, "Google Keyword Planner unavailable", cancellationToken);
    }

    private async Task<(int StatusCode, object? Body)> RunAndParseAsync(
        IReadOnlyList<string> arguments,
        string? stdin,
        string unavailableDetail,
        CancellationToken cancellationToken)
    {
        var env = new Dictionary<string, string>();
        var dbUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
        if (!string.IsNullOrWhiteSpace(dbUrl))
        {
            env["DATABASE_URL"] = dbUrl;
        }

        var result = await python.RunAsync(
            arguments,
            stdin: stdin,
            environment: env,
            timeoutSeconds: 120,
            cancellationToken: cancellationToken);

        if (result.TimedOut)
        {
            return (504, new { detail = "Request timed out" });
        }

        if (result.ExitCode == 2)
        {
            return (501, new { detail = unavailableDetail });
        }

        if (result.ExitCode != 0)
        {
            var detail = TryReadError(result.Stdout) ?? result.Stderr.Trim();
            return (500, new { detail = string.IsNullOrEmpty(detail) ? "Request failed" : detail });
        }

        var payload = ParseLastJsonLine(result.Stdout);
        return (200, JsonSerializer.Deserialize<object>(payload));
    }

    private static string? TryReadError(string stdout)
    {
        try
        {
            using var doc = JsonDocument.Parse(ParseLastJsonLine(stdout));
            if (doc.RootElement.TryGetProperty("error", out var err))
            {
                return err.GetString();
            }
        }
        catch (JsonException)
        {
            // ignore
        }

        return null;
    }

    private static string ParseLastJsonLine(string stdout)
    {
        var lines = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return lines.Length > 0 ? lines[^1] : "{}";
    }
}
