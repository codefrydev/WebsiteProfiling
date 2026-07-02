using Data.Application.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Data.Api.Controllers;

[ApiController]
[Route("api/properties")]
[Tags("Properties")]
public sealed class PropertiesController(IPropertiesCrudRepository properties) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        var items = await properties.ListPublicAsync(cancellationToken);
        return Ok(new { properties = items });
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create(
        [FromBody] PropertyUpsertBody body,
        CancellationToken cancellationToken)
    {
        var name = (body.Name ?? "").Trim();
        var domain = (body.CanonicalDomain ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(domain))
        {
            return BadRequest(new { detail = "name and canonical_domain required" });
        }

        try
        {
            var siteUrl = string.IsNullOrWhiteSpace(body.SiteUrl) ? null : body.SiteUrl.Trim();
            var id = await properties.UpsertByDomainAsync(name, domain, siteUrl, cancellationToken);
            return StatusCode(StatusCodes.Status201Created, new { id, name, canonical_domain = domain });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost("ensure")]
    public async Task<IActionResult> Ensure(
        [FromBody] PropertyEnsureBody body,
        CancellationToken cancellationToken)
    {
        var startUrl = (body.StartUrl ?? "").Trim();
        if (string.IsNullOrEmpty(startUrl))
        {
            return BadRequest(new { detail = "startUrl required" });
        }

        var propId = await properties.EnsureFromStartUrlAsync(startUrl, cancellationToken);
        if (propId is null)
        {
            return BadRequest(new { detail = "Valid site URL with a domain is required" });
        }

        var domain = WebsiteProfiling.Contracts.Properties.PropertyDomainHelper.CanonicalDomainFromStartUrl(startUrl);
        var prop = string.IsNullOrEmpty(domain)
            ? null
            : await properties.GetByDomainAsync(domain, cancellationToken);

        return Ok(new
        {
            id = propId,
            canonical_domain = domain,
            default_crawl_preset = prop?.GetValueOrDefault("default_crawl_preset"),
        });
    }

    [HttpGet("resolve")]
    public async Task<IActionResult> Resolve(
        [FromQuery] string startUrl,
        CancellationToken cancellationToken)
    {
        startUrl = startUrl.Trim();
        if (string.IsNullOrEmpty(startUrl))
        {
            return BadRequest(new { detail = "startUrl required" });
        }

        var propId = await properties.LookupIdFromStartUrlAsync(startUrl, cancellationToken);
        var domain = WebsiteProfiling.Contracts.Properties.PropertyDomainHelper.CanonicalDomainFromStartUrl(startUrl);
        var prop = string.IsNullOrEmpty(domain)
            ? null
            : await properties.GetByDomainAsync(domain, cancellationToken);

        return Ok(new
        {
            id = propId,
            canonical_domain = domain,
            default_crawl_preset = prop?.GetValueOrDefault("default_crawl_preset"),
        });
    }

    [HttpGet("{propertyId:long}")]
    public async Task<IActionResult> Get(long propertyId, CancellationToken cancellationToken)
    {
        var prop = await properties.GetByIdAsync(propertyId, cancellationToken);
        return prop is null ? NotFound(new { detail = "Property not found" }) : Ok(prop);
    }

    [HttpDelete("{propertyId:long}")]
    public async Task<IActionResult> Delete(long propertyId, CancellationToken cancellationToken)
    {
        if (!await properties.DeleteAsync(propertyId, cancellationToken))
        {
            return NotFound(new { detail = "Property not found" });
        }

        return Ok(new { ok = true });
    }

    [HttpGet("{propertyId:long}/ops")]
    public async Task<IActionResult> GetOps(long propertyId, CancellationToken cancellationToken)
    {
        var ops = await properties.GetOpsAsync(propertyId, cancellationToken);
        return ops is null ? NotFound(new { detail = "Property not found" }) : Ok(ops);
    }

    [HttpPut("{propertyId:long}/ops")]
    public async Task<IActionResult> UpdateOps(
        long propertyId,
        [FromBody] OpsSettingsBody body,
        CancellationToken cancellationToken)
    {
        if (await properties.GetByIdAsync(propertyId, cancellationToken) is null)
        {
            return NotFound(new { detail = "Property not found" });
        }

        await properties.UpdateOpsAsync(
            propertyId,
            body.ScheduleCron,
            body.AlertWebhookUrl,
            body.AlertEmail,
            cancellationToken);
        return Ok(new { ok = true });
    }

    [HttpGet("{propertyId:long}/preset")]
    public async Task<IActionResult> GetPreset(long propertyId, CancellationToken cancellationToken)
    {
        var prop = await properties.GetByIdAsync(propertyId, cancellationToken);
        if (prop is null)
        {
            return NotFound(new { detail = "Property not found" });
        }

        return Ok(new { default_crawl_preset = prop.GetValueOrDefault("default_crawl_preset") });
    }

    [HttpPut("{propertyId:long}/preset")]
    public async Task<IActionResult> UpdatePreset(
        long propertyId,
        [FromBody] PresetBody body,
        CancellationToken cancellationToken)
    {
        if (await properties.GetByIdAsync(propertyId, cancellationToken) is null)
        {
            return NotFound(new { detail = "Property not found" });
        }

        var preset = string.IsNullOrWhiteSpace(body.Preset) ? null : body.Preset.Trim();
        await properties.UpdateCrawlPresetAsync(propertyId, preset, cancellationToken);
        return Ok(new { ok = true, default_crawl_preset = preset });
    }

    [HttpPost("{propertyId:long}/authorize")]
    public async Task<IActionResult> Authorize(long propertyId, CancellationToken cancellationToken)
    {
        if (await properties.GetByIdAsync(propertyId, cancellationToken) is null)
        {
            return NotFound(new { detail = "Property not found" });
        }

        await properties.AuthorizeCrawlAsync(propertyId, cancellationToken);
        return Ok(new { ok = true });
    }
}

public sealed class PropertyUpsertBody
{
    public string? Name { get; init; }

    public string? CanonicalDomain { get; init; }

    public string? SiteUrl { get; init; }
}

public sealed class PropertyEnsureBody
{
    public string? StartUrl { get; init; }
}

public sealed class OpsSettingsBody
{
    public string? ScheduleCron { get; init; }

    public string? AlertWebhookUrl { get; init; }

    public string? AlertEmail { get; init; }
}

public sealed class PresetBody
{
    public string? Preset { get; init; }
}
