using System.Text.RegularExpressions;
using AiService.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tools.Context;

/// <summary>
/// Property-scoped report resolution for audit tools. Mirrors Data domain matching plus
/// <c>audit_health_snapshots</c> fallback when <c>properties.canonical_domain</c> is missing.
/// </summary>
public static partial class AuditReportResolver
{
    private const int SlugScanLimit = 100;

    public static async Task<long?> ResolveLatestReportIdAsync(
        AuditToolsDbContext db,
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        var domain = await db.Properties.AsNoTracking()
            .Where(x => x.Id == propertyId)
            .Select(x => x.CanonicalDomain)
            .FirstOrDefaultAsync(cancellationToken);

        var reportId = await ResolveByDomainCandidatesAsync(db, domain, cancellationToken);
        if (reportId is not null)
        {
            return reportId;
        }

        return await db.AuditHealthSnapshots.AsNoTracking()
            .Where(x => x.PropertyId == propertyId)
            .OrderByDescending(x => x.GeneratedAt)
            .ThenByDescending(x => x.Id)
            .Select(x => (long?)x.ReportId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public static async Task<string?> ResolveLatestPayloadDataAsync(
        AuditToolsDbContext db,
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        var reportId = await ResolveLatestReportIdAsync(db, propertyId, cancellationToken);
        if (reportId is null)
        {
            return null;
        }

        return await db.ReportPayloads.AsNoTracking()
            .Where(x => x.Id == reportId.Value)
            .Select(x => x.Data)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static async Task<long?> ResolveByDomainCandidatesAsync(
        AuditToolsDbContext db,
        string? domainRaw,
        CancellationToken cancellationToken)
    {
        var candidates = BuildDomainCandidates(domainRaw);
        if (candidates.Count == 0)
        {
            return null;
        }

        var exactId = await db.ReportPayloads.AsNoTracking()
            .Where(r => r.CanonicalDomain != null &&
                        candidates.Contains(r.CanonicalDomain.ToLower()))
            .OrderByDescending(r => r.Id)
            .Select(r => (long?)r.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (exactId is not null)
        {
            return exactId;
        }

        var slugCandidates = candidates.Select(SlugifyDomain).Distinct(StringComparer.Ordinal).ToList();
        var recent = await db.ReportPayloads.AsNoTracking()
            .OrderByDescending(r => r.Id)
            .Take(SlugScanLimit)
            .Select(r => new { r.Id, r.CanonicalDomain })
            .ToListAsync(cancellationToken);

        foreach (var row in recent)
        {
            if (row.CanonicalDomain is null)
            {
                continue;
            }

            var rowSlug = SlugifyDomain(row.CanonicalDomain);
            if (slugCandidates.Contains(rowSlug, StringComparer.Ordinal))
            {
                return row.Id;
            }
        }

        return null;
    }

    internal static List<string> BuildDomainCandidates(string? domainRaw)
    {
        var normalized = NormalizeDomain(domainRaw);
        if (string.IsNullOrEmpty(normalized))
        {
            return [];
        }

        var candidates = new List<string> { normalized };
        if (normalized.StartsWith("www.", StringComparison.Ordinal))
        {
            candidates.Add(normalized[4..]);
        }
        else
        {
            candidates.Add($"www.{normalized}");
        }

        return candidates.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    internal static string NormalizeDomain(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return "";
        }

        var s = raw.Trim().ToLowerInvariant();
        if (s.StartsWith("https://", StringComparison.Ordinal))
        {
            s = s["https://".Length..];
        }
        else if (s.StartsWith("http://", StringComparison.Ordinal))
        {
            s = s["http://".Length..];
        }

        var slash = s.IndexOf('/');
        if (slash >= 0)
        {
            s = s[..slash];
        }

        return s.TrimEnd('.');
    }

    internal static string SlugifyDomain(string? domain) =>
        string.IsNullOrWhiteSpace(domain)
            ? ""
            : SlugRegex().Replace(domain.Trim().ToLowerInvariant(), "-");

    [GeneratedRegex("[^a-z0-9]+", RegexOptions.CultureInvariant)]
    private static partial Regex SlugRegex();
}
