using System.Text.Json;
using IntegrationsService.Application.Repositories;

namespace IntegrationsService.Application.Google;

public sealed class PageLiveService(
    PropertyRepository properties,
    GoogleAppSettingsRepository appSettings,
    IGoogleCredentialFactory credentials,
    IGscSearchAnalyticsClient gscClient,
    IGa4ReportClient ga4Client,
    PageGoogleSnapshotRepository snapshots)
{
    public async Task<Dictionary<string, object?>> FetchPageLiveAsync(
        string pageUrl,
        long? propertyId = null,
        bool persist = true,
        CancellationToken cancellationToken = default)
    {
        pageUrl = pageUrl.Trim();
        var errors = new List<string>();
        long? pid = propertyId;

        if (pid is null or <= 0)
        {
            errors.Add("propertyId is required for live fetch.");
            return EmptyResult(pageUrl, errors);
        }

        var prop = await properties.GetByIdAsync(pid.Value, cancellationToken);
        if (prop is null)
        {
            errors.Add($"Property id {pid} not found.");
            return EmptyResult(pageUrl, errors);
        }

        var defaultDays = await appSettings.DefaultDateRangeDaysAsync(cancellationToken);
        var targets = await properties.GetGoogleTargetsAsync(pid.Value, defaultDays, cancellationToken);
        var gscSite = targets?.GscSiteUrl ?? "";
        var ga4Property = targets?.Ga4PropertyId ?? "";
        var dateRangeDays = targets?.DateRangeDays ?? defaultDays;
        var startUrl = (prop.SiteUrl ?? "").Trim();

        Dictionary<string, object?>? gscData = null;
        Dictionary<string, object?>? ga4Data = null;

        try
        {
            var cred = await credentials.BuildCredentialsAsync(pid.Value, cancellationToken);

            if (!string.IsNullOrWhiteSpace(gscSite))
            {
                try
                {
                    var sites = await gscClient.ListSitesAsync(cred, cancellationToken);
                    var (resolved, siteError) = gscClient.ResolveSiteUrl(gscSite, sites);
                    if (resolved is null)
                    {
                        errors.Add($"GSC: {siteError}");
                    }
                    else
                    {
                        var (data, gscErrs) = await gscClient.FetchPageLiveAsync(
                            cred, resolved, pageUrl, dateRangeDays, cancellationToken);
                        gscData = data;
                        errors.AddRange(gscErrs);
                    }
                }
                catch (Exception ex)
                {
                    errors.Add($"GSC: {ex.Message}");
                }
            }
            else
            {
                errors.Add("GSC: no site URL configured.");
            }

            if (!string.IsNullOrWhiteSpace(ga4Property))
            {
                try
                {
                    var (data, ga4Errs) = await ga4Client.FetchPageLiveAsync(
                        cred, ga4Property, pageUrl, startUrl, dateRangeDays, cancellationToken);
                    ga4Data = data;
                    errors.AddRange(ga4Errs);
                }
                catch (Exception ex)
                {
                    errors.Add($"GA4: {ex.Message}");
                }
            }
            else
            {
                errors.Add("GA4: no property ID configured.");
            }
        }
        catch (InvalidOperationException ex)
        {
            errors.Add(ex.Message);
        }

        var endGsc = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3);
        var startGsc = endGsc.AddDays(-(Math.Max(1, dateRangeDays) - 1));
        var dateRange = new Dictionary<string, object?>
        {
            ["start"] = startGsc.ToString("yyyy-MM-dd"),
            ["end"] = endGsc.ToString("yyyy-MM-dd"),
        };

        var publicGsc = PageLookupService.PublicGscPageFromDict(gscData);
        var publicGa4 = PageLookupService.PublicGa4PageFromDict(ga4Data);

        long? snapshotId = null;
        if (persist)
        {
            var payload = new Dictionary<string, object?>
            {
                ["source"] = "live",
                ["page_url"] = pageUrl,
                ["gsc"] = publicGsc,
                ["ga4"] = publicGa4,
                ["date_range"] = dateRange,
                ["errors"] = errors.Where(e => !string.IsNullOrWhiteSpace(e)).ToList(),
            };
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(payload));
            snapshotId = await snapshots.WriteAsync(pageUrl, doc, cancellationToken);
        }

        return new Dictionary<string, object?>
        {
            ["ok"] = gscData is not null || ga4Data is not null,
            ["snapshotId"] = snapshotId,
            ["source"] = "live",
            ["pageUrl"] = pageUrl,
            ["gsc"] = publicGsc,
            ["ga4"] = publicGa4,
            ["dateRange"] = dateRange,
            ["fetchedAt"] = null,
            ["errors"] = errors.Where(e => !string.IsNullOrWhiteSpace(e)).ToList(),
        };
    }

    private static Dictionary<string, object?> EmptyResult(string pageUrl, List<string> errors) =>
        new()
        {
            ["ok"] = false,
            ["snapshotId"] = null,
            ["source"] = "live",
            ["pageUrl"] = pageUrl,
            ["gsc"] = null,
            ["ga4"] = null,
            ["dateRange"] = new Dictionary<string, object?>(),
            ["fetchedAt"] = null,
            ["errors"] = errors,
        };
}
