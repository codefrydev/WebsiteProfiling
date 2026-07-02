using Data.Application.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Data.Api.Controllers;

[ApiController]
[Route("api/pipeline-settings")]
[Tags("Pipeline Settings")]
public sealed class PipelineSettingsController : ControllerBase
{
    private readonly IPipelineSettingsRepository _repository;

    public PipelineSettingsController(IPipelineSettingsRepository repository) => _repository = repository;

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var settings = await _repository.GetAsync(cancellationToken);
        var body = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (key, value) in settings.Domains)
        {
            body[key] = value;
        }

        body["workspace"] = new
        {
            activePropertyId = settings.Workspace.ActivePropertyId,
            warningMapperInput = settings.Workspace.WarningMapperInput,
            warningMapperInputType = settings.Workspace.WarningMapperInputType,
        };
        body["state"] = settings.State;
        body["source"] = settings.Source;
        return Ok(body);
    }

    [HttpPut]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Put([FromBody] PipelineSettingsPutRequest body, CancellationToken cancellationToken)
    {
        var coerced = body.State.ToDictionary(
            static pair => pair.Key,
            static pair => pair.Value?.ToString() ?? "",
            StringComparer.Ordinal);
        await _repository.SaveStateAsync(coerced, cancellationToken);
        return Ok(new { ok = true, source = "db" });
    }
}

public sealed class PipelineSettingsPutRequest
{
    public Dictionary<string, object?> State { get; init; } = new(StringComparer.Ordinal);
}
