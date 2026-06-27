using System.Text.Json.Nodes;
using AiService.Application.Repositories;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers.Internal;

[ApiController]
[Route("internal/completion")]
[Tags("Internal Completion")]
public sealed class CompletionController(
    StructuredCompletionService completionService,
    ILlmSettingsRepository configRepository) : ControllerBase
{
    [HttpPost("json")]
    public async Task<IActionResult> CompleteJson([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var system = body["system"]?.GetValue<string>() ?? "";
        var user = body["user"]?.GetValue<string>() ?? "";
        var settings = await configRepository.LoadAsync(cancellationToken);
        var result = await completionService.CompleteJsonAsync(system, user, settings, cancellationToken);
        return Ok(result);
    }
}
