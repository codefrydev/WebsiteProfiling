using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace ReportService.Api.Controllers;

[ApiController]
[Route("api/crawl")]
[Tags("Crawl")]
public sealed class CrawlController(NpgsqlDataSource dataSource) : ControllerBase
{
    [HttpGet("browser-status")]
    public async Task<IActionResult> BrowserStatus(CancellationToken cancellationToken)
    {
        var python = Environment.GetEnvironmentVariable("PYTHON") ?? "python3";
        var repoRoot = Environment.GetEnvironmentVariable("WEBSITE_PROFILING_ROOT") ?? Directory.GetCurrentDirectory();
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = python,
                WorkingDirectory = repoRoot,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            psi.ArgumentList.Add("-c");
            psi.ArgumentList.Add(
                "from website_profiling.crawl.fetchers import ensure_browser_deps; "
                + "import json; print(json.dumps(ensure_browser_deps()))");
            var srcPath = Path.Combine(repoRoot, "src");
            psi.Environment["PYTHONPATH"] = psi.Environment.TryGetValue("PYTHONPATH", out var existing) && !string.IsNullOrEmpty(existing)
                ? $"{srcPath}{Path.PathSeparator}{existing}"
                : srcPath;
            using var proc = System.Diagnostics.Process.Start(psi);
            if (proc is null)
            {
                return Ok(new { ok = false, error = "Failed to start Python" });
            }

            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

            // Drain stdout and stderr concurrently — reading one to completion before even
            // starting the other risks a deadlock if the child fills the unread stream's
            // pipe buffer while blocked writing to it.
            var stdoutTask = proc.StandardOutput.ReadToEndAsync(linkedCts.Token);
            var stderrTask = proc.StandardError.ReadToEndAsync(linkedCts.Token);
            string stdout;
            try
            {
                await Task.WhenAll(stdoutTask, stderrTask);
                await proc.WaitForExitAsync(linkedCts.Token);
                stdout = stdoutTask.Result;
            }
            catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
            {
                return Ok(new { ok = false, error = "Timed out waiting for browser-status probe" });
            }

            return Content(stdout, "application/json");
        }
        catch (Exception ex)
        {
            return Ok(new { ok = false, error = ex.Message });
        }
    }

    [HttpGet("page-html")]
    public async Task<IActionResult> GetPageHtml(
        [FromQuery] string url,
        [FromQuery] long? crawlRunId,
        CancellationToken cancellationToken)
    {
        if (crawlRunId is null or <= 0)
        {
            return BadRequest(new { detail = "crawlRunId is required" });
        }

        if (string.IsNullOrWhiteSpace(url))
        {
            return BadRequest(new { detail = "url is required" });
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            SELECT url, html, status, content_type, fetch_method, byte_length, captured_at
            FROM crawl_page_html
            WHERE crawl_run_id = @runId AND url = @url
            LIMIT 1
            """,
            conn);
        cmd.Parameters.AddWithValue("runId", crawlRunId.Value);
        cmd.Parameters.AddWithValue("url", url.Trim().TrimEnd('/'));
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return NotFound(new { detail = $"No stored HTML found for url={url} in crawlRunId={crawlRunId}" });
        }

        return Ok(new Dictionary<string, object?>
        {
            ["url"] = reader.IsDBNull(0) ? url.Trim() : reader.GetString(0),
            ["html"] = reader.IsDBNull(1) ? "" : reader.GetString(1),
            ["status"] = reader.IsDBNull(2) ? null : reader.GetString(2),
            ["content_type"] = reader.IsDBNull(3) ? null : reader.GetString(3),
            ["fetch_method"] = reader.IsDBNull(4) ? null : reader.GetString(4),
            ["byte_length"] = reader.IsDBNull(5) ? null : reader.GetInt32(5),
            ["captured_at"] = reader.IsDBNull(6) ? null : reader.GetString(6),
        });
    }
}
