using System.Text.Json;
using CoreService.Api.DataApplication.Content;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

[ApiController]
[Route("api/keywords")]
[Tags("Keywords")]
public sealed class KeywordsController : ControllerBase
{
    [HttpPost("content-brief")]
    public IActionResult ContentBrief([FromBody] JsonElement body)
    {
        var keyword = body.TryGetProperty("keyword", out var kwEl)
            ? (kwEl.GetString() ?? "").Trim()
            : "";
        if (keyword.Length == 0)
        {
            return BadRequest(new { detail = "keyword required" });
        }

        var brief = ContentBriefBuilder.Build(
            keyword,
            ContentBriefBuilder.ParseRows(body),
            ContentBriefBuilder.ParseGaps(body));

        return Ok(new { brief });
    }
}
