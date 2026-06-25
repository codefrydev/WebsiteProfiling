using System.Text.Json;
using System.Text.Json.Nodes;
using Data.Application.Repositories;

namespace Data.Application.Report;

public sealed class ReportSectionService(
    IReportRepository reports,
    IGoogleDataRepository googleData,
    IPropertyRepository properties) : IReportSectionService
{
    public async Task<JsonObject?> GetSectionPayloadAsync(
        long? reportId,
        string? domain,
        string section,
        CancellationToken cancellationToken = default)
    {
        if (!SectionFields.ByKey.TryGetValue(section, out var fields))
        {
            return null;
        }

        var ctx = await reports.GetPayloadContextAsync(reportId, domain, cancellationToken);
        if (ctx is null)
        {
            return null;
        }

        using var doc = JsonDocument.Parse(ctx.DataJson);
        var slice = new JsonObject();
        foreach (var field in fields)
        {
            if (doc.RootElement.TryGetProperty(field, out var val))
            {
                slice[field] = JsonNode.Parse(val.GetRawText());
            }
        }

        if (string.Equals(section, "traffic", StringComparison.Ordinal))
        {
            await MergeTrafficGoogleAsync(slice, domain, ctx.CanonicalDomain, cancellationToken);
        }

        return slice;
    }

    private async Task MergeTrafficGoogleAsync(
        JsonObject slice,
        string? domainQuery,
        string? reportCanonicalDomain,
        CancellationToken cancellationToken)
    {
        var propertyId = await ResolvePropertyIdAsync(domainQuery, reportCanonicalDomain, cancellationToken);
        if (propertyId is null)
        {
            return;
        }

        var google = await googleData.GetLatestPayloadAsync(propertyId, cancellationToken);
        if (google is not null)
        {
            slice["google"] = google;
        }
    }

    private async Task<long?> ResolvePropertyIdAsync(
        string? domainQuery,
        string? reportCanonicalDomain,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(domainQuery))
        {
            var fromQuery = await properties.ResolvePropertyIdByDomainAsync(domainQuery, cancellationToken);
            if (fromQuery is not null)
            {
                return fromQuery;
            }
        }

        if (!string.IsNullOrWhiteSpace(reportCanonicalDomain))
        {
            return await properties.ResolvePropertyIdByDomainAsync(reportCanonicalDomain, cancellationToken);
        }

        return null;
    }
}
