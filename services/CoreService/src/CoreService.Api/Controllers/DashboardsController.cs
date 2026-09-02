using System.Text.Json;
using CoreService.Api.Application.Dashboard;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

[ApiController]
[Route("api/dashboards")]
[Tags("Dashboards")]
public sealed class DashboardsController(DashboardRepository dashboards) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] long propertyId,
        CancellationToken cancellationToken)
    {
        var items = await dashboards.ListAsync(propertyId, cancellationToken);
        return Ok(new { dashboards = items });
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create(
        [FromBody] DashboardCreateBody body,
        CancellationToken cancellationToken)
    {
        var name = string.IsNullOrWhiteSpace(body.Name) ? "Untitled dashboard" : body.Name.Trim();
        var layout = body.LayoutJson ?? JsonSerializer.SerializeToElement(new { });
        var dashboard = await dashboards.CreateAsync(body.PropertyId, name, layout, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, new { dashboard });
    }

    [HttpGet("{dashboardId:long}")]
    public async Task<IActionResult> Get(
        long dashboardId,
        [FromQuery] long propertyId,
        CancellationToken cancellationToken)
    {
        var dashboard = await dashboards.GetAsync(dashboardId, propertyId, cancellationToken);
        return dashboard is null ? NotFound(new { detail = "Not found" }) : Ok(new { dashboard });
    }

    [HttpPut("{dashboardId:long}")]
    public async Task<IActionResult> Update(
        long dashboardId,
        [FromBody] DashboardUpdateBody body,
        CancellationToken cancellationToken)
    {
        var dashboard = await dashboards.UpdateAsync(
            dashboardId,
            body.PropertyId,
            body.Name,
            body.LayoutJson,
            body.IsDefault,
            cancellationToken);
        return dashboard is null ? NotFound(new { detail = "Not found" }) : Ok(new { dashboard });
    }

    [HttpDelete("{dashboardId:long}")]
    public async Task<IActionResult> Delete(
        long dashboardId,
        [FromQuery] long propertyId,
        CancellationToken cancellationToken)
    {
        if (!await dashboards.DeleteAsync(dashboardId, propertyId, cancellationToken))
        {
            return NotFound(new { detail = "Not found" });
        }

        return Ok(new { ok = true });
    }
}

public sealed class DashboardCreateBody
{
    public long PropertyId { get; init; }

    public string? Name { get; init; }

    public JsonElement? LayoutJson { get; init; }
}

public sealed class DashboardUpdateBody
{
    public long PropertyId { get; init; }

    public string? Name { get; init; }

    public JsonElement? LayoutJson { get; init; }

    public bool? IsDefault { get; init; }
}
