using System.Text.Json;
using CoreService.Api.DataApplication.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

[ApiController]
[Route("api/page-markdown")]
[Tags("Page Markdown")]
public sealed class PageMarkdownController(
    IPageMarkdownRepository markdown,
    IPipelineJobEnqueueRepository jobs) : ControllerBase
{
    [HttpGet("")]
    public async Task<IActionResult> List(
        [FromQuery] long crawlRunId,
        [FromQuery] int page = 1,
        [FromQuery] int limit = 25,
        [FromQuery] string? q = null,
        CancellationToken cancellationToken = default)
    {
        if (crawlRunId <= 0)
        {
            return BadRequest(new { detail = "crawlRunId required" });
        }

        page = Math.Max(1, page);
        var pageSize = Math.Clamp(limit, 1, 100);
        var offset = (page - 1) * pageSize;

        try
        {
            var (items, total) = await markdown.ListAsync(
                crawlRunId,
                pageSize,
                offset,
                q ?? "",
                cancellationToken);
            var totalPages = Math.Max(1, (total + pageSize - 1) / pageSize);
            return Ok(new
            {
                items,
                total,
                page,
                pageSize,
                totalPages,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { detail = ex.Message });
        }
    }

    [HttpDelete("")]
    public async Task<IActionResult> Delete(
        [FromBody] JsonElement body,
        CancellationToken cancellationToken)
    {
        if (!body.TryGetProperty("crawlRunId", out var runEl) || runEl.GetInt64() <= 0)
        {
            return BadRequest(new { detail = "crawlRunId required" });
        }

        try
        {
            var crawlRunId = runEl.GetInt64();
            var deleted = await markdown.DeleteForRunAsync(crawlRunId, cancellationToken);
            return Ok(new { ok = true, crawlRunId, deletedRows = deleted });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { detail = ex.Message });
        }
    }

    [HttpGet("content")]
    public async Task<IActionResult> Content(
        [FromQuery] long crawlRunId,
        [FromQuery] string url,
        CancellationToken cancellationToken)
    {
        if (crawlRunId <= 0)
        {
            return BadRequest(new { detail = "crawlRunId required" });
        }

        if (string.IsNullOrWhiteSpace(url))
        {
            return BadRequest(new { detail = "url required" });
        }

        try
        {
            var content = await markdown.ReadContentAsync(crawlRunId, url, cancellationToken);
            if (content is null)
            {
                return NotFound(new { detail = "Not found" });
            }

            return Ok(new { content });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { detail = ex.Message });
        }
    }

    [HttpPost("extract")]
    public async Task<IActionResult> Extract(
        [FromBody] JsonElement body,
        CancellationToken cancellationToken)
    {
        if (!body.TryGetProperty("crawlRunId", out var runEl) || runEl.GetInt64() <= 0)
        {
            return BadRequest(new { detail = "crawlRunId required" });
        }

        var crawlRunId = runEl.GetInt64();
        var strategy = body.TryGetProperty("strategy", out var stratEl)
                       && stratEl.GetString() == "full_body"
            ? "full_body"
            : "main_only";
        var overwrite = !body.TryGetProperty("overwrite", out var owEl) || owEl.ValueKind != JsonValueKind.False;
        var workers = body.TryGetProperty("workers", out var workersEl) && workersEl.TryGetInt32(out var w)
            ? Math.Clamp(w, 1, 16)
            : 4;

        var command = $"page-markdown --crawl-run-id {crawlRunId} --strategy {strategy} --workers {workers}";
        if (!overwrite)
        {
            command += " --no-overwrite";
        }

        try
        {
            var jobId = Guid.NewGuid().ToString();
            var ok = await jobs.EnqueueAsync(jobId, "page-markdown", command, cancellationToken);
            if (!ok)
            {
                return BadRequest(new { detail = "A pipeline job is already running" });
            }

            return Ok(new { jobId, crawlRunId, strategy, overwrite });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { detail = ex.Message });
        }
    }

    [HttpGet("runs")]
    public async Task<IActionResult> Runs(
        [FromQuery] long? propertyId,
        CancellationToken cancellationToken)
    {
        try
        {
            var runs = await markdown.ListRunsAsync(propertyId, cancellationToken);
            return Ok(new { runs });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { detail = ex.Message });
        }
    }
}
