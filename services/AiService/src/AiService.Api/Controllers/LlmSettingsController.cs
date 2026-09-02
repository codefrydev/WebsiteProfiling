using AiService.Api.Domain.Models;
using AiService.Api.Domain.Repositories;
using AiService.Api.Providers.Chat;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers;

/// <summary>Typed LLM configuration — <c>GET/PUT /api/llm-settings</c>.</summary>
[ApiController]
[Route("api/llm-settings")]
[Tags("Config")]
public sealed class LlmSettingsController : ControllerBase
{
    private readonly ILlmSettingsRepository _settings;

    public LlmSettingsController(ILlmSettingsRepository settings) => _settings = settings;

    [HttpGet("")]
    [ProducesResponseType(typeof(LlmSettingsGetResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var settings = await _settings.LoadForClientAsync(cancellationToken);
        var runtime = await _settings.LoadAsync(cancellationToken);
        return Ok(new LlmSettingsGetResponse
        {
            Settings = settings,
            Source = "db",
            ApiKeyConfigured = LlmConfigHelpers.IsApiKeyConfigured(runtime),
        });
    }

    [HttpPut("")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Put([FromBody] LlmSettingsPutRequest body, CancellationToken cancellationToken)
    {
        if (body.Settings is not null)
        {
            await _settings.MergeAsync(body.Settings, cancellationToken);
        }

        var runtime = await _settings.LoadAsync(cancellationToken);
        return Ok(new { ok = true, apiKeyConfigured = LlmConfigHelpers.IsApiKeyConfigured(runtime) });
    }
}
