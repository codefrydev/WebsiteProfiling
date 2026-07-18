using AiService.Mcp;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>MCP audit tool catalog — <c>GET /api/mcp-tools</c>.</summary>
[ApiController]
[Route("api/mcp-tools")]
[Tags("MCP Tools")]
public sealed class McpToolsController : ControllerBase
{
    private readonly McpToolCatalogService _catalog;

    public McpToolsController(McpToolCatalogService catalog) => _catalog = catalog;

    [HttpGet("")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _catalog.ListToolsAsync(cancellationToken));
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { detail = ex.Message });
        }
    }
}
