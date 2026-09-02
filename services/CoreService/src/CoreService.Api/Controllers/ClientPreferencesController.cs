using CoreService.Api.DataApplication.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

[ApiController]
[Route("api/client-preferences")]
[Tags("Client Preferences")]
public sealed class ClientPreferencesController : ControllerBase
{
    private readonly IClientPreferencesRepository _repository;

    private static readonly Dictionary<string, string> FieldMap = new(StringComparer.Ordinal)
    {
        ["defaultLandingView"] = "default_landing_view",
        ["chatFabCorner"] = "chat_fab_corner",
        ["sidebarCollapsed"] = "sidebar_collapsed",
        ["networkViewMode"] = "network_view_mode",
        ["contentStudioAiEnabled"] = "content_studio_ai_enabled",
        ["pipelinePythonExe"] = "pipeline_python_exe",
        ["pipelineRepoRoot"] = "pipeline_repo_root",
        ["radiusScale"] = "radius_scale",
        ["densityScale"] = "density_scale",
        ["animationsEnabled"] = "animations_enabled",
        ["fontSizeScale"] = "font_size_scale",
    };

    public ClientPreferencesController(IClientPreferencesRepository repository) => _repository = repository;

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var prefs = await _repository.GetAsync(cancellationToken);
        return Ok(new
        {
            defaultLandingView = prefs.DefaultLandingView,
            chatFabCorner = prefs.ChatFabCorner,
            sidebarCollapsed = prefs.SidebarCollapsed,
            networkViewMode = prefs.NetworkViewMode,
            contentStudioAiEnabled = prefs.ContentStudioAiEnabled,
            pipelinePythonExe = prefs.PipelinePythonExe,
            pipelineRepoRoot = prefs.PipelineRepoRoot,
            radiusScale = prefs.RadiusScale,
            densityScale = prefs.DensityScale,
            animationsEnabled = prefs.AnimationsEnabled,
            fontSizeScale = prefs.FontSizeScale,
        });
    }

    [HttpPut]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Put([FromBody] ClientPreferencesPutRequest body, CancellationToken cancellationToken)
    {
        var updates = new Dictionary<string, object>(StringComparer.Ordinal);
        AddIfPresent(updates, "defaultLandingView", body.DefaultLandingView);
        AddIfPresent(updates, "chatFabCorner", body.ChatFabCorner);
        AddIfPresent(updates, "sidebarCollapsed", body.SidebarCollapsed);
        AddIfPresent(updates, "networkViewMode", body.NetworkViewMode);
        AddIfPresent(updates, "contentStudioAiEnabled", body.ContentStudioAiEnabled);
        AddIfPresent(updates, "pipelinePythonExe", body.PipelinePythonExe);
        AddIfPresent(updates, "pipelineRepoRoot", body.PipelineRepoRoot);
        AddIfPresent(updates, "radiusScale", body.RadiusScale);
        AddIfPresent(updates, "densityScale", body.DensityScale);
        AddIfPresent(updates, "animationsEnabled", body.AnimationsEnabled);
        AddIfPresent(updates, "fontSizeScale", body.FontSizeScale);

        var mapped = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var (camel, snake) in FieldMap)
        {
            if (updates.TryGetValue(camel, out var value))
            {
                mapped[snake] = value;
            }
        }

        if (mapped.Count > 0)
        {
            await _repository.PatchAsync(mapped, cancellationToken);
        }

        return Ok(new { ok = true });
    }

    private static void AddIfPresent(Dictionary<string, object> target, string key, object? value)
    {
        if (value is not null)
        {
            target[key] = value;
        }
    }
}

public sealed class ClientPreferencesPutRequest
{
    public string? DefaultLandingView { get; init; }

    public string? ChatFabCorner { get; init; }

    public bool? SidebarCollapsed { get; init; }

    public string? NetworkViewMode { get; init; }

    public bool? ContentStudioAiEnabled { get; init; }

    public string? PipelinePythonExe { get; init; }

    public string? PipelineRepoRoot { get; init; }

    public string? RadiusScale { get; init; }

    public string? DensityScale { get; init; }

    public bool? AnimationsEnabled { get; init; }

    public string? FontSizeScale { get; init; }
}
