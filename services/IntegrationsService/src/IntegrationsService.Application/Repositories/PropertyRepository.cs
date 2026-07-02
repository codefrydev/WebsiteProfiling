using System.Text.Json;
using IntegrationsService.Application.Google;
using IntegrationsService.Application.Persistence;
using IntegrationsService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace IntegrationsService.Application.Repositories;

public sealed class PropertyRepository(IntegrationsDbContext db)
{
    public async Task<Property?> GetByIdAsync(long propertyId, CancellationToken cancellationToken = default) =>
        await db.Properties.AsNoTracking().FirstOrDefaultAsync(p => p.Id == propertyId, cancellationToken);

    public async Task<Property?> GetByIdTrackedAsync(long propertyId, CancellationToken cancellationToken = default) =>
        await db.Properties.FirstOrDefaultAsync(p => p.Id == propertyId, cancellationToken);

    public async Task<Property?> GetByDomainAsync(string domain, CancellationToken cancellationToken = default)
    {
        var normalized = (domain ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(normalized))
        {
            return null;
        }

        return await db.Properties.AsNoTracking()
            .FirstOrDefaultAsync(p => p.CanonicalDomain == normalized, cancellationToken);
    }

    public async Task<long?> GetPropertyIdByDomainAsync(
        string domain,
        CancellationToken cancellationToken = default)
    {
        var prop = await GetByDomainAsync(domain, cancellationToken);
        return prop?.Id;
    }

    public async Task<long?> EnsureFromStartUrlAsync(
        string startUrl,
        CancellationToken cancellationToken = default)
    {
        var domain = PropertyDomainHelper.CanonicalDomainFromStartUrl(startUrl);
        if (string.IsNullOrEmpty(domain) || !PropertyDomainHelper.IsValidCanonicalDomain(domain))
        {
            return null;
        }

        var existing = await GetByDomainAsync(domain, cancellationToken);
        if (existing is not null)
        {
            return existing.Id;
        }

        var name = PropertyDomainHelper.DerivePropertyName(domain, startUrl);
        var prop = new Property
        {
            Name = name,
            CanonicalDomain = domain,
            SiteUrl = string.IsNullOrWhiteSpace(startUrl) ? null : startUrl.Trim(),
        };
        db.Properties.Add(prop);
        await db.SaveChangesAsync(cancellationToken);
        return prop.Id;
    }

    public async Task<long?> ResolvePropertyIdForPageAsync(
        string pageUrl,
        string? propertyIdStr,
        string? domainStr,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(propertyIdStr)
            && long.TryParse(propertyIdStr, out var explicitId)
            && explicitId > 0)
        {
            return explicitId;
        }

        if (!string.IsNullOrWhiteSpace(domainStr))
        {
            var byDomain = await GetPropertyIdByDomainAsync(domainStr, cancellationToken);
            if (byDomain is not null)
            {
                return byDomain;
            }
        }

        var host = PropertyDomainHelper.ExtractHostname(pageUrl);
        if (string.IsNullOrEmpty(host))
        {
            return null;
        }

        return await GetPropertyIdByDomainAsync(host, cancellationToken);
    }

    public async Task<(string GscSiteUrl, string Ga4PropertyId, int DateRangeDays)?> GetGoogleTargetsAsync(
        long propertyId,
        int defaultDateRangeDays,
        CancellationToken cancellationToken = default)
    {
        var prop = await GetByIdAsync(propertyId, cancellationToken);
        if (prop is null)
        {
            return null;
        }

        var days = prop.GoogleDateRangeDays.GetValueOrDefault() > 0
            ? prop.GoogleDateRangeDays!.Value
            : defaultDateRangeDays;

        return (
            (prop.GscSiteUrl ?? "").Trim(),
            (prop.Ga4PropertyId ?? "").Trim(),
            days);
    }

    public async Task ApplyGoogleCredentialsPatchAsync(
        long propertyId,
        PropertyGoogleCredentialsPatch patch,
        CancellationToken cancellationToken = default)
    {
        var prop = await GetByIdTrackedAsync(propertyId, cancellationToken)
            ?? throw new InvalidOperationException($"Property id {propertyId} not found.");

        if (patch.GscSiteUrl is not null)
        {
            prop.GscSiteUrl = string.IsNullOrWhiteSpace(patch.GscSiteUrl) ? null : patch.GscSiteUrl.Trim();
        }

        if (patch.Ga4PropertyId is not null)
        {
            var v = patch.Ga4PropertyId.Trim();
            if (!string.IsNullOrEmpty(v) && !v.All(char.IsDigit))
            {
                throw new ArgumentException(
                    "Analytics property ID must be a numeric ID (e.g. 123456789). "
                    + "The G-XXXXXXX code is a Measurement ID.");
            }

            prop.Ga4PropertyId = string.IsNullOrEmpty(v) ? null : v;
        }

        if (patch.DateRangeDays is > 0)
        {
            prop.GoogleDateRangeDays = patch.DateRangeDays;
        }

        if (patch.AuthMode is not null)
        {
            prop.GoogleAuthMode = string.IsNullOrWhiteSpace(patch.AuthMode) ? null : patch.AuthMode;
        }

        if (patch.ConnectedEmail is not null)
        {
            prop.GoogleConnectedEmail = string.IsNullOrWhiteSpace(patch.ConnectedEmail)
                ? null
                : patch.ConnectedEmail.Trim();
        }

        if (patch.RefreshToken is not null)
        {
            var token = patch.RefreshToken.Trim();
            prop.GoogleRefreshToken = string.IsNullOrEmpty(token) ? null : token;
            if (!string.IsNullOrEmpty(token))
            {
                prop.GoogleConnectedAt = DateTimeOffset.UtcNow;
            }
            else
            {
                prop.GoogleConnectedAt = null;
                if (patch.ConnectedEmail is null)
                {
                    prop.GoogleConnectedEmail = null;
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DisconnectGoogleAsync(long propertyId, CancellationToken cancellationToken = default)
    {
        await ApplyGoogleCredentialsPatchAsync(
            propertyId,
            new PropertyGoogleCredentialsPatch
            {
                RefreshToken = "",
                AuthMode = "",
            },
            cancellationToken);
    }
}

public sealed class PropertyGoogleCredentialsPatch
{
    public string? RefreshToken { get; init; }

    public string? AuthMode { get; init; }

    public string? GscSiteUrl { get; init; }

    public string? Ga4PropertyId { get; init; }

    public int? DateRangeDays { get; init; }

    public string? ConnectedEmail { get; init; }
}

public sealed class PropertyGooglePublicStatus
{
    public bool Connected { get; init; }

    public string? AuthMode { get; init; }

    public string? GscSiteUrl { get; init; }

    public string? Ga4PropertyId { get; init; }

    public int DateRangeDays { get; init; } = 28;

    public string? ConnectedEmail { get; init; }

    public DateTimeOffset? ConnectedAt { get; init; }
}

public static class PropertyGoogleStatusMapper
{
    public static PropertyGooglePublicStatus ToPublicStatus(Property prop)
    {
        return new PropertyGooglePublicStatus
        {
            Connected = prop.GoogleConnectedAt is not null,
            AuthMode = prop.GoogleAuthMode,
            GscSiteUrl = prop.GscSiteUrl,
            Ga4PropertyId = prop.Ga4PropertyId,
            DateRangeDays = prop.GoogleDateRangeDays.GetValueOrDefault() > 0
                ? prop.GoogleDateRangeDays!.Value
                : 28,
            ConnectedEmail = prop.GoogleConnectedEmail,
            ConnectedAt = prop.GoogleConnectedAt,
        };
    }
}
