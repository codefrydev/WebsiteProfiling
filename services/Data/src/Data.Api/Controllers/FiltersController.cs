using System.Text.Json;
using Data.Application.Dto.Filters;
using Data.Application.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Data.Api.Controllers;

/// <summary>
/// Saved crawl filter endpoints ported from FastAPI's <c>/api/filters</c>.
/// </summary>
[ApiController]
[Route("api/filters")]
[Tags("Filters")]
public sealed class FiltersController : ControllerBase
{
    private readonly ISavedFilterRepository _filters;

    public FiltersController(ISavedFilterRepository filters) => _filters = filters;

    /// <summary>List saved filter presets for a property.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(SavedFilterListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> List([FromQuery] int? propertyId, CancellationToken cancellationToken)
    {
        if (propertyId is null or 0)
            return BadRequest(new { detail = "propertyId required" });

        var filters = await _filters.ListAsync(propertyId.Value, cancellationToken);
        return Ok(new SavedFilterListResponse { Filters = filters });
    }

    /// <summary>Create or update a saved filter preset.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(SavedFilterOkResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Upsert(
        [FromBody] UpsertSavedFilterRequest body, CancellationToken cancellationToken)
    {
        var name = (body.Name ?? string.Empty).Trim();
        if (body.PropertyId == 0 || string.IsNullOrEmpty(name))
            return BadRequest(new { detail = "propertyId and name required" });

        var filterJson = body.FilterJson is { ValueKind: JsonValueKind.Object } element
            ? element
            : JsonSerializer.SerializeToElement(new { });

        await _filters.UpsertAsync(body.PropertyId, name, filterJson, cancellationToken);
        return Ok(new SavedFilterOkResponse());
    }

    /// <summary>Delete a saved filter preset by name.</summary>
    [HttpDelete]
    [ProducesResponseType(typeof(SavedFilterOkResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(
        [FromBody] DeleteSavedFilterRequest body, CancellationToken cancellationToken)
    {
        var name = (body.Name ?? string.Empty).Trim();
        if (body.PropertyId == 0 || string.IsNullOrEmpty(name))
            return BadRequest(new { detail = "propertyId and name required" });

        var deleted = await _filters.DeleteAsync(body.PropertyId, name, cancellationToken);
        if (!deleted)
            return NotFound(new { detail = "filter not found" });

        return Ok(new SavedFilterOkResponse());
    }
}
