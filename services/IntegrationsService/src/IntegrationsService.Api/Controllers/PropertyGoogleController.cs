using System.Text.Json;
using IntegrationsService.Application.Google;
using IntegrationsService.Application.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace IntegrationsService.Api.Controllers;

[ApiController]
[Route("api/properties/{propertyId:long}/google")]
[Tags("Property Google")]
public sealed class PropertyGoogleController(
    PropertyRepository properties,
    GoogleAppSettingsRepository appSettings,
    GoogleDataWriteRepository googleData,
    GoogleFetchService fetchService,
    IGoogleCredentialFactory credentials,
    IGscSearchAnalyticsClient gscClient,
    IGa4ReportClient ga4Client,
    GscLinksDataRepository gscLinks,
    PythonCliRunner python,
    FastApiPythonBridge fastApiBridge) : ControllerBase
{
    [HttpGet("status")]
    public async Task<IActionResult> Status(long propertyId, CancellationToken cancellationToken)
    {
        var prop = await properties.GetByIdAsync(propertyId, cancellationToken);
        if (prop is null)
        {
            return NotFound(new { error = "Property not found" });
        }

        var appCfg = await appSettings.ReadAsync(cancellationToken);
        var publicStatus = PropertyGoogleStatusMapper.ToPublicStatus(prop);
        return Ok(new
        {
            connected = publicStatus.Connected,
            authMode = publicStatus.AuthMode,
            gscSiteUrl = publicStatus.GscSiteUrl,
            ga4PropertyId = publicStatus.Ga4PropertyId,
            dateRangeDays = publicStatus.DateRangeDays,
            connectedEmail = publicStatus.ConnectedEmail,
            connectedAt = publicStatus.ConnectedAt,
            hasClientId = !string.IsNullOrWhiteSpace(appCfg.ClientId),
            lastFetchedAt = await googleData.GetLastFetchedAtAsync(propertyId, cancellationToken),
            propertyId,
        });
    }

    [HttpPost("test")]
    public async Task<IActionResult> Test(long propertyId, CancellationToken cancellationToken)
    {
        var prop = await properties.GetByIdAsync(propertyId, cancellationToken);
        if (prop is null)
        {
            return NotFound(new { error = "Property not found" });
        }

        var warnings = new List<string>();
        var log = new List<string>();
        try
        {
            var cred = await credentials.BuildCredentialsAsync(propertyId, cancellationToken);
            log.Add("  Google credentials: OK (token refreshed)");

            var targets = await properties.GetGoogleTargetsAsync(
                propertyId,
                await appSettings.DefaultDateRangeDaysAsync(cancellationToken),
                cancellationToken);
            var gscSiteUrl = targets?.GscSiteUrl ?? "";
            var ga4PropertyId = targets?.Ga4PropertyId ?? "";

            if (!string.IsNullOrWhiteSpace(gscSiteUrl))
            {
                var sites = await gscClient.ListSitesAsync(cred, cancellationToken);
                log.Add($"  GSC: found {sites.Count} accessible site(s): [{string.Join(", ", sites)}]");
                var (resolved, siteError) = gscClient.ResolveSiteUrl(gscSiteUrl, sites);
                if (resolved is not null)
                {
                    if (resolved != gscSiteUrl)
                    {
                        log.Add(
                            $"  GSC: NOTE — Configured '{gscSiteUrl}' will use '{resolved}' "
                            + "(Search Console requires an exact property URL).");
                    }

                    var (ok, probeMsg) = await gscClient.ProbeSiteAsync(cred, resolved, cancellationToken);
                    log.Add(ok ? $"  GSC: OK — {probeMsg}" : $"  GSC: ERROR — {probeMsg}");
                    if (!ok)
                    {
                        warnings.Add(probeMsg);
                    }
                }
                else
                {
                    log.Add($"  GSC: ERROR — {siteError}");
                    warnings.Add(siteError ?? "GSC site URL mismatch");
                }
            }
            else
            {
                log.Add("  GSC: skipped (no GSC site configured for this property)");
                warnings.Add("GSC site URL is not configured.");
            }

            if (!string.IsNullOrWhiteSpace(ga4PropertyId))
            {
                var (props, listError) = await ga4Client.ListPropertiesAsync(cred, cancellationToken);
                if (listError is not null)
                {
                    log.Add($"  GA4: NOTE — {listError}");
                }
                else if (props.Count > 0)
                {
                    var names = props.Select(p => $"{p.DisplayName} ({p.Id})");
                    log.Add($"  GA4: found {props.Count} accessible propert(ies): [{string.Join(", ", names)}]");
                }

                var (ok, probeMsg) = await ga4Client.ProbePropertyAsync(cred, ga4PropertyId, cancellationToken);
                log.Add(ok ? $"  GA4: OK — {probeMsg}" : $"  GA4: ERROR — {probeMsg}");
                if (!ok)
                {
                    warnings.Add(probeMsg);
                }
            }
            else
            {
                log.Add("  GA4: skipped (no GA4 property ID configured for this property)");
                warnings.Add("GA4 property ID is not configured.");
            }

            var okResult = warnings.Count == 0;
            return Ok(new
            {
                ok = okResult,
                log = string.Join('\n', log),
                exitCode = okResult ? 0 : 1,
            });
        }
        catch (InvalidOperationException ex)
        {
            return Ok(new { ok = false, log = ex.Message, exitCode = 1 });
        }
    }

    [HttpGet("properties")]
    public async Task<IActionResult> ListProperties(long propertyId, CancellationToken cancellationToken)
    {
        if (await properties.GetByIdAsync(propertyId, cancellationToken) is null)
        {
            return NotFound(new { error = "Property not found" });
        }

        try
        {
            var result = await fetchService.ListPropertiesAsync(propertyId, cancellationToken);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPatch("credentials")]
    [HttpPost("credentials")]
    public async Task<IActionResult> SaveCredentials(
        long propertyId,
        [FromBody] PropertyGoogleCredentialsBody body,
        CancellationToken cancellationToken)
    {
        if (await properties.GetByIdAsync(propertyId, cancellationToken) is null)
        {
            return NotFound(new { error = "Property not found" });
        }

        try
        {
            await properties.ApplyGoogleCredentialsPatchAsync(
                propertyId,
                new PropertyGoogleCredentialsPatch
                {
                    GscSiteUrl = body.GscSiteUrl,
                    Ga4PropertyId = body.Ga4PropertyId,
                    DateRangeDays = body.DateRangeDays,
                    AuthMode = body.AuthMode,
                    ConnectedEmail = body.ConnectedEmail,
                    RefreshToken = body.RefreshToken,
                },
                cancellationToken);

            var prop = await properties.GetByIdAsync(propertyId, cancellationToken);
            return Ok(new
            {
                ok = true,
                status = prop is null ? null : PropertyGoogleStatusMapper.ToPublicStatus(prop),
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("disconnect")]
    public async Task<IActionResult> Disconnect(long propertyId, CancellationToken cancellationToken)
    {
        if (await properties.GetByIdAsync(propertyId, cancellationToken) is null)
        {
            return NotFound(new { error = "Property not found" });
        }

        await properties.DisconnectGoogleAsync(propertyId, cancellationToken);
        var prop = await properties.GetByIdAsync(propertyId, cancellationToken);
        return Ok(new
        {
            ok = true,
            status = prop is null ? null : PropertyGoogleStatusMapper.ToPublicStatus(prop),
        });
    }

    [HttpGet("links/status")]
    public async Task<IActionResult> LinksStatus(long propertyId, CancellationToken cancellationToken)
    {
        if (await properties.GetByIdAsync(propertyId, cancellationToken) is null)
        {
            return NotFound(new { error = "Property not found" });
        }

        try
        {
            var status = await gscLinks.ReadStatusAsync(propertyId, cancellationToken);
            return Ok(status);
        }
        catch
        {
            return Ok(new { hasData = false });
        }
    }

    [HttpPost("links/import")]
    public async Task<IActionResult> LinksImport(
        long propertyId,
        [FromBody] GscLinksImportBody body,
        CancellationToken cancellationToken)
    {
        if (await properties.GetByIdAsync(propertyId, cancellationToken) is null)
        {
            return NotFound(new { error = "Property not found" });
        }

        var fileContent = (body.FileContent ?? "").Trim();
        if (string.IsNullOrEmpty(fileContent))
        {
            return BadRequest(new { ok = false, error = "fileContent is required" });
        }

        try
        {
            JsonDocument? result;
            if (FastApiPythonBridge.ShouldUseBridge())
            {
                result = await fastApiBridge.RunGscLinksImportAsync(
                    propertyId,
                    fileContent,
                    body.FileName,
                    cancellationToken);
            }
            else
            {
                result = await python.RunJsonFromLastLineAsync(
                    [
                        "-m", "src", "gsc-links-import",
                        "--property-id", propertyId.ToString(),
                        "--csv-stdin",
                        "--file-name", body.FileName ?? "",
                    ],
                    stdin: fileContent,
                    timeoutSeconds: 60,
                    cancellationToken: cancellationToken);
            }

            if (result is null)
            {
                return StatusCode(500, new { ok = false, error = "GSC links import failed" });
            }

            using (result)
            {
                var root = result.RootElement;
                if (root.TryGetProperty("ok", out var okProp) && okProp.ValueKind == JsonValueKind.False)
                {
                    return BadRequest(new
                    {
                        ok = false,
                        error = root.TryGetProperty("error", out var err) ? err.GetString() : "Import failed",
                    });
                }

                return Ok(JsonSerializer.Deserialize<object>(root.GetRawText()));
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }
}

public sealed class PropertyGoogleCredentialsBody
{
    public string? GscSiteUrl { get; init; }

    public string? Ga4PropertyId { get; init; }

    public int? DateRangeDays { get; init; }

    public string? AuthMode { get; init; }

    public string? ConnectedEmail { get; init; }

    public string? RefreshToken { get; init; }
}

public sealed class GscLinksImportBody
{
    public string? FileContent { get; init; }

    public string? FileName { get; init; }
}
