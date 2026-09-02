using CoreService.Api.IntegrationsApplication.Google;
using CoreService.Api.IntegrationsApplication.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CoreService.Api.Controllers.Internal;

[ApiController]
[Route("internal/integrations/google")]
[Tags("Internal")]
public sealed class GoogleFetchController(
    GoogleFetchService fetchService,
    GoogleDataWriteRepository googleData) : ControllerBase
{
    [HttpPost("fetch")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Fetch(
        [FromBody] GoogleFetchRequestBody body,
        CancellationToken cancellationToken)
    {
        if (body.PropertyId <= 0)
        {
            return BadRequest(new { error = "propertyId is required" });
        }

        try
        {
            var request = new GoogleFetchRequest
            {
                PropertyId = body.PropertyId,
                DateRangeDays = body.DateRangeDays,
                CrawlUrls = body.CrawlUrls,
                StartUrl = body.StartUrl,
                Config = body.Config is null
                    ? null
                    : new GoogleFetchConfig
                    {
                        KeywordGscMaxRows = body.Config.KeywordGscMaxRows ?? 25000,
                        GoogleUrlGapListLimit = body.Config.GoogleUrlGapListLimit ?? 200,
                    },
            };

            var payload = await fetchService.FetchAsync(request, cancellationToken);
            var json = fetchService.SerializePayload(payload);
            await googleData.InsertAsync(body.PropertyId, json, payload.FetchedAt, cancellationToken);
            return Content(json, "application/json");
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}

public sealed class GoogleFetchRequestBody
{
    public long PropertyId { get; init; }

    public int? DateRangeDays { get; init; }

    public List<string>? CrawlUrls { get; init; }

    public string? StartUrl { get; init; }

    public GoogleFetchConfigBody? Config { get; init; }
}

public sealed class GoogleFetchConfigBody
{
    public int? KeywordGscMaxRows { get; init; }

    public int? GoogleUrlGapListLimit { get; init; }
}
