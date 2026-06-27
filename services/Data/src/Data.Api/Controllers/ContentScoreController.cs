using System.Text.Json;
using Data.Application.Python;
using Microsoft.AspNetCore.Mvc;

namespace Data.Api.Controllers;

[ApiController]
[Route("api/content")]
[Tags("Content Studio")]
public sealed class ContentScoreController(DataPythonRunner python) : ControllerBase
{
    [HttpPost("score")]
    public async Task<IActionResult> Score(
        [FromBody] JsonElement body,
        CancellationToken cancellationToken)
    {
        var keyword = body.TryGetProperty("keyword", out var kwEl)
            ? (kwEl.GetString() ?? "").Trim()
            : "";
        if (keyword.Length == 0)
        {
            return BadRequest(new { detail = "keyword required" });
        }

        long? propertyId = null;
        if (body.TryGetProperty("propertyId", out var propEl)
            && propEl.ValueKind is JsonValueKind.Number
            && propEl.TryGetInt64(out var pid)
            && pid > 0)
        {
            propertyId = pid;
        }

        var bodyHtml = body.TryGetProperty("bodyHtml", out var htmlEl) ? htmlEl.GetString() ?? "" : "";
        var titleTag = body.TryGetProperty("titleTag", out var titleEl) ? titleEl.GetString() ?? "" : "";
        var metaDescription = body.TryGetProperty("metaDescription", out var metaEl)
            ? metaEl.GetString() ?? ""
            : "";
        string? landingUrl = body.TryGetProperty("landingUrl", out var urlEl) ? urlEl.GetString()?.Trim() : null;
        if (string.IsNullOrEmpty(landingUrl))
        {
            landingUrl = null;
        }

        try
        {
            var result = await python.RunContentScoreAsync(
                propertyId,
                keyword,
                bodyHtml,
                titleTag,
                metaDescription,
                landingUrl,
                cancellationToken);
            return Ok(new { score = result.Payload });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { detail = $"Content score failed: {ex.Message}" });
        }
    }
}
