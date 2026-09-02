using CoreService.Api.IntegrationsApplication.Google;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers.Internal;

[ApiController]
[Route("internal/integrations/keywords")]
[Tags("Internal")]
public sealed class KeywordEnrichController(PythonCliRunner python, FastApiPythonBridge fastApiBridge) : ControllerBase
{
    [HttpPost("enrich")]
    public async Task<IActionResult> Enrich(
        [FromBody] KeywordEnrichRequestBody body,
        CancellationToken cancellationToken)
    {
        if (body.PropertyId <= 0)
        {
            return BadRequest(new { error = "propertyId is required" });
        }

        PythonCliResult result;
        if (FastApiPythonBridge.ShouldUseBridge())
        {
            result = await fastApiBridge.RunKeywordEnrichAsync(body.PropertyId, cancellationToken);
        }
        else
        {
            var env = new Dictionary<string, string>
            {
                ["WP_PROPERTY_ID"] = body.PropertyId.ToString(),
            };
            if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DATABASE_URL")))
            {
                env["DATABASE_URL"] = Environment.GetEnvironmentVariable("DATABASE_URL")!;
            }

            result = await python.RunAsync(
                ["-m", "src", "keywords", "--enrich-google"],
                environment: env,
                timeoutSeconds: 120,
                cancellationToken: cancellationToken);
        }

        if (result.TimedOut)
        {
            return StatusCode(504, new { ok = false, error = "Keyword enrich timed out after 120s" });
        }

        var combined = result.Stdout + result.Stderr;
        var log = combined.Length > 28_000 ? combined[^28_000..] : combined;

        return Ok(new
        {
            ok = result.ExitCode == 0,
            exitCode = result.ExitCode,
            log,
            propertyId = body.PropertyId,
        });
    }
}

public sealed class KeywordEnrichRequestBody
{
    public long PropertyId { get; init; }
}
