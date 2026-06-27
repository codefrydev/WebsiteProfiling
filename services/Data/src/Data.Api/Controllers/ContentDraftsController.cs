using System.Text.Json;
using Data.Application.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Data.Api.Controllers;

[ApiController]
[Route("api/content-drafts")]
[Tags("Content Drafts")]
public sealed class ContentDraftsController(IContentDraftRepository drafts) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] long propertyId, CancellationToken cancellationToken)
    {
        if (propertyId <= 0)
        {
            return BadRequest(new { detail = "propertyId required" });
        }

        var items = await drafts.ListAsync(propertyId, cancellationToken);
        return Ok(new { drafts = items });
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] JsonElement body,
        CancellationToken cancellationToken)
    {
        if (!body.TryGetProperty("propertyId", out var propEl) || propEl.GetInt64() <= 0)
        {
            return BadRequest(new { detail = "propertyId required" });
        }

        var propertyId = propEl.GetInt64();
        var title = body.TryGetProperty("title", out var titleEl) ? titleEl.GetString() ?? "Untitled draft" : "Untitled draft";
        var targetKeyword = body.TryGetProperty("target_keyword", out var kwEl) ? kwEl.GetString() ?? "" : "";
        string? landingUrl = body.TryGetProperty("landing_url", out var urlEl) ? urlEl.GetString()?.Trim() : null;
        if (string.IsNullOrEmpty(landingUrl))
        {
            landingUrl = null;
        }

        var status = body.TryGetProperty("status", out var statusEl) ? statusEl.GetString() ?? "draft" : "draft";
        var bodyHtml = body.TryGetProperty("body_html", out var htmlEl) ? htmlEl.GetString() ?? "" : "";
        var titleTag = body.TryGetProperty("title_tag", out var tagEl) ? tagEl.GetString() ?? "" : "";
        var metaDescription = body.TryGetProperty("meta_description", out var metaEl) ? metaEl.GetString() ?? "" : "";

        var id = await drafts.CreateAsync(
            propertyId,
            title,
            targetKeyword,
            landingUrl,
            status,
            bodyHtml,
            titleTag,
            metaDescription,
            cancellationToken);

        return Ok(new { id, propertyId });
    }

    [HttpGet("{draftId:long}")]
    public async Task<IActionResult> Get(long draftId, CancellationToken cancellationToken)
    {
        if (draftId <= 0)
        {
            return BadRequest(new { detail = "invalid draft id" });
        }

        var draft = await drafts.GetAsync(draftId, cancellationToken);
        return draft is null ? NotFound(new { detail = "draft not found" }) : Ok(new { draft });
    }

    [HttpPatch("{draftId:long}")]
    public async Task<IActionResult> Update(
        long draftId,
        [FromBody] JsonElement body,
        CancellationToken cancellationToken)
    {
        if (draftId <= 0)
        {
            return BadRequest(new { detail = "invalid draft id" });
        }

        var patch = body.EnumerateObject().ToDictionary(p => p.Name, p => p.Value);
        var draft = await drafts.UpdateAsync(draftId, patch, cancellationToken);
        return draft is null ? NotFound(new { detail = "draft not found" }) : Ok(new { draft });
    }

    [HttpDelete("{draftId:long}")]
    public async Task<IActionResult> Delete(long draftId, CancellationToken cancellationToken)
    {
        if (draftId <= 0)
        {
            return BadRequest(new { detail = "invalid draft id" });
        }

        if (!await drafts.DeleteAsync(draftId, cancellationToken))
        {
            return NotFound(new { detail = "draft not found" });
        }

        return Ok(new { ok = true });
    }
}
