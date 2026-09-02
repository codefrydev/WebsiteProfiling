using CoreService.Api.DataApplication.Persistence;
using CoreService.Api.Domain.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace CoreService.Api.DataApplication.Repositories;

public sealed class PropertyRepository(DataDbContext db) : IPropertyRepository
{
    public async Task<long?> ResolvePropertyIdByDomainAsync(
        string? domainRaw,
        CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeDomain(domainRaw);
        if (string.IsNullOrEmpty(normalized))
        {
            return null;
        }

        var candidates = new[]
        {
            normalized,
            normalized.StartsWith("www.", StringComparison.Ordinal)
                ? normalized[4..]
                : $"www.{normalized}",
        };

        foreach (var domain in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var id = await db.Set<Property>()
                .Where(p => p.CanonicalDomain != null &&
                            p.CanonicalDomain.ToLower() == domain.ToLowerInvariant())
                .Select(p => (long?)p.Id)
                .FirstOrDefaultAsync(cancellationToken);

            if (id is > 0)
            {
                return id;
            }
        }

        return null;
    }

    public static string NormalizeDomain(string? raw)
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
}
