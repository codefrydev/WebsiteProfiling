using System.Text.Json.Nodes;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers.Internal;

[ApiController]
[Route("internal/completion")]
[Tags("Internal Completion")]
public sealed class CompletionController(
    StructuredCompletionService completionService,
    ILlmConfigRepository configRepository) : ControllerBase
{
    [HttpPost("json")]
    public async Task<IActionResult> CompleteJson([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var system = body["system"]?.GetValue<string>() ?? "";
        var user = body["user"]?.GetValue<string>() ?? "";
        var cfg = await configRepository.LoadAsync(cancellationToken);
        var result = await completionService.CompleteJsonAsync(system, user, cfg, cancellationToken);
        return Ok(result);
    }
}
