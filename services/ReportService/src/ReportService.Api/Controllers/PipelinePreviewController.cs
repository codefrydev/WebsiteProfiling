using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using ReportService.Application.Bridge;

namespace ReportService.Api.Controllers;

/// <summary>Browser-facing pipeline preview — relays to Python's internal
/// /internal/pipeline/preview via the existing FastApiPythonBridge. Unlike
/// PipelineOrchestratorController (internal, job-queue based), this runs
/// synchronously against a single page for the visual pipeline editor.</summary>
[ApiController]
[Route("api/pipeline-preview")]
[Tags("Pipeline Preview")]
public sealed class PipelinePreviewController(FastApiPythonBridge bridge) : ControllerBase
{
    private const string PreviewPath = "/internal/pipeline/preview";

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Preview([FromBody] JsonElement body, CancellationToken cancellationToken)
    {
        var result = await bridge.ForwardRequestAsync(HttpMethod.Post, PreviewPath, body.GetRawText(), cancellationToken);
        return new ContentResult
        {
            StatusCode = result.StatusCode,
            Content = string.IsNullOrEmpty(result.Body) ? "{}" : result.Body,
            ContentType = "application/json",
        };
    }
}
