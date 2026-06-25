using System.Text.Json.Nodes;
using AiService.Application.Dto;
using AiService.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers.Internal;

/// <summary>Internal enrichment endpoints — <c>POST /internal/enrichment/*</c>.</summary>
[ApiController]
[Route("internal/enrichment")]
[Tags("Internal Enrichment")]
public sealed class EnrichmentController : ControllerBase
{
    private readonly EnrichmentService _enrichment;

    public EnrichmentController(EnrichmentService enrichment) => _enrichment = enrichment;

    [HttpPost("run")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Run([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var pages = body["pages"] as JsonArray ?? [];
        var result = await _enrichment.RunEnrichmentAsync(pages, cancellationToken);
        return Ok(result);
    }

    [HttpPost("cluster-keywords")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ClusterKeywords([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var keywords = new List<string>();
        if (body["keywords"] is JsonArray arr)
        {
            foreach (var node in arr)
            {
                var kw = (node?.GetValue<string>() ?? "").Trim();
                if (!string.IsNullOrEmpty(kw))
                {
                    keywords.Add(kw);
                }
            }
        }

        var result = await _enrichment.ClusterKeywordsAsync(keywords, cancellationToken);
        return Ok(result);
    }

    [HttpPost("issue-fixes")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> IssueFixes([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var result = await _enrichment.GenerateIssueFixAsync(body, body.GetRefresh(), cancellationToken);
        return Ok(result);
    }

    [HttpPost("audit-summary")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> AuditSummary([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var result = await _enrichment.GenerateAuditSummaryAsync(body, cancellationToken);
        return Ok(result);
    }
}
