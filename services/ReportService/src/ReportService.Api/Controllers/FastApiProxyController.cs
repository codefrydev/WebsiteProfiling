using Microsoft.AspNetCore.Mvc;
using ReportService.Application.Bridge;

namespace ReportService.Api.Controllers;

/// <summary>
/// Strangler proxies for compare/dashboard routes until native C# handlers replace Python FastAPI.
/// </summary>
[ApiController]
[Route("api")]
public sealed class FastApiProxyController(FastApiPythonBridge bridge) : ControllerBase
{
    [HttpPost("compare/export")]
    public async Task<IActionResult> CompareExport(CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var body = await reader.ReadToEndAsync(cancellationToken);
        var raw = await bridge.ForwardRequestAsync(HttpMethod.Post, "/api/compare/export", body, cancellationToken);
        return Content(raw ?? "", "text/csv");
    }

    [HttpGet("dashboards")]
    public async Task<IActionResult> ListDashboards(CancellationToken cancellationToken)
    {
        var query = Request.QueryString.HasValue ? Request.QueryString.Value : "";
        var raw = await bridge.ForwardRequestAsync(HttpMethod.Get, $"/api/dashboards{query}", null, cancellationToken);
        return Content(raw ?? "{}", "application/json");
    }

    [HttpPost("dashboards")]
    public async Task<IActionResult> CreateDashboard(CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var body = await reader.ReadToEndAsync(cancellationToken);
        var raw = await bridge.ForwardRequestAsync(HttpMethod.Post, "/api/dashboards", body, cancellationToken);
        return Content(raw ?? "{}", "application/json");
    }

    [HttpGet("dashboards/{dashboardId:long}")]
    public async Task<IActionResult> GetDashboard(long dashboardId, CancellationToken cancellationToken)
    {
        var query = Request.QueryString.HasValue ? Request.QueryString.Value : "";
        var raw = await bridge.ForwardRequestAsync(
            HttpMethod.Get,
            $"/api/dashboards/{dashboardId}{query}",
            null,
            cancellationToken);
        return Content(raw ?? "{}", "application/json");
    }

    [HttpPut("dashboards/{dashboardId:long}")]
    public async Task<IActionResult> UpdateDashboard(long dashboardId, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var body = await reader.ReadToEndAsync(cancellationToken);
        var raw = await bridge.ForwardRequestAsync(HttpMethod.Put, $"/api/dashboards/{dashboardId}", body, cancellationToken);
        return Content(raw ?? "{}", "application/json");
    }

    [HttpDelete("dashboards/{dashboardId:long}")]
    public async Task<IActionResult> DeleteDashboard(long dashboardId, CancellationToken cancellationToken)
    {
        var raw = await bridge.ForwardRequestAsync(
            HttpMethod.Delete,
            $"/api/dashboards/{dashboardId}",
            null,
            cancellationToken);
        return Content(raw ?? "{}", "application/json");
    }
}
