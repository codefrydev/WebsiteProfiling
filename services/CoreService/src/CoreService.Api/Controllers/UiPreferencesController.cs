using System.Text.Json;
using CoreService.Api.DataApplication.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

[ApiController]
[Route("api/ui-preferences")]
[Tags("UI Preferences")]
public sealed class UiPreferencesController : ControllerBase
{
    private readonly IUiPreferencesRepository _repository;

    public UiPreferencesController(IUiPreferencesRepository repository) => _repository = repository;

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var prefs = await _repository.GetAsync(cancellationToken);
        return Ok(new
        {
            brandName = prefs.BrandName,
            brandSubtitle = prefs.BrandSubtitle,
            brandLogoUrl = prefs.BrandLogoUrl,
            customThemeJson = prefs.CustomThemeJson,
            uiPrefsJson = prefs.UiPrefsJson,
        });
    }

    [HttpPut]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Put([FromBody] UiPreferencesPutRequest body, CancellationToken cancellationToken)
    {
        var updates = new Dictionary<string, string>(StringComparer.Ordinal);
        if (body.BrandName is not null)
        {
            updates["brand_name"] = body.BrandName;
        }
        if (body.BrandSubtitle is not null)
        {
            updates["brand_subtitle"] = body.BrandSubtitle;
        }
        if (body.BrandLogoUrl is not null)
        {
            updates["brand_logo_url"] = body.BrandLogoUrl;
        }
        if (body.CustomThemeJson is not null)
        {
            updates["custom_theme"] = JsonSerializer.Serialize(body.CustomThemeJson.Value);
        }
        if (body.UiPrefsJson is not null)
        {
            updates["ui_prefs"] = JsonSerializer.Serialize(body.UiPrefsJson.Value);
        }

        await _repository.PatchAsync(updates, cancellationToken);
        return Ok(new { ok = true });
    }
}

public sealed class UiPreferencesPutRequest
{
    public string? BrandName { get; init; }

    public string? BrandSubtitle { get; init; }

    public string? BrandLogoUrl { get; init; }

    public JsonElement? CustomThemeJson { get; init; }

    public JsonElement? UiPrefsJson { get; init; }
}
