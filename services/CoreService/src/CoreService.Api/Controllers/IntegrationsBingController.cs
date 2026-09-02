using CoreService.Api.IntegrationsApplication.Google;
using CoreService.Api.IntegrationsApplication.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers;

[ApiController]
[Route("api/integrations/bing")]
[Tags("Integrations Bing")]
public sealed class IntegrationsBingController(
    PipelineConfigRepository pipelineConfig,
    BingWebmasterService bing) : ControllerBase
{
    [HttpPost("sync")]
    public async Task<IActionResult> Sync(CancellationToken cancellationToken)
    {
        IReadOnlyDictionary<string, string> state;
        try
        {
            state = await pipelineConfig.ReadKnownAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }

        state.TryGetValue("bing_webmaster_api_key", out var apiKey);
        state.TryGetValue("start_url", out var siteUrl);
        apiKey = (apiKey ?? "").Trim();
        siteUrl = (siteUrl ?? "").Trim();

        if (string.IsNullOrEmpty(apiKey) || string.IsNullOrEmpty(siteUrl))
        {
            return BadRequest(new
            {
                error = "Set bing_webmaster_api_key and start_url in pipeline settings.",
            });
        }

        try
        {
            var result = await bing.FetchBacklinksSummaryAsync(apiKey, siteUrl, cancellationToken);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
