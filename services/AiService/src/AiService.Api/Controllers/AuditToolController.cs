using System.Text.Json.Nodes;
using AiService.Api.Tools.Registry;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>Audit tool dispatch — <c>POST /api/report/audit-tool</c>.</summary>
[ApiController]
[Route("api/report")]
[Tags("Report Audit Tool")]
public sealed class AuditToolController : ControllerBase
{
    private readonly ToolDispatcher _dispatcher;

    public AuditToolController(ToolDispatcher dispatcher) => _dispatcher = dispatcher;

    [HttpPost("audit-tool")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Run([FromBody] AuditToolBody body, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(body.ToolName) || body.PropertyId == 0)
        {
            return BadRequest(new { detail = "toolName and propertyId required" });
        }

        try
        {
            var args = body.Args ?? [];
            var result = await _dispatcher.DispatchAsync(
                body.ToolName,
                body.PropertyId,
                body.ReportId,
                args,
                cancellationToken);

            return Ok(new { result });
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = ex.Message });
        }
    }

    public sealed class AuditToolBody
    {
        public string ToolName { get; set; } = "";

        public long PropertyId { get; set; }

        public long? ReportId { get; set; }

        public JsonObject? Args { get; set; }
    }
}
