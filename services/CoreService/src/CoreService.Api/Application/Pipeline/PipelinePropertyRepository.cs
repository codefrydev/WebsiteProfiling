using System.Text.RegularExpressions;
using Npgsql;

namespace CoreService.Api.Application.Pipeline;

public sealed class PipelinePropertyRepository(NpgsqlDataSource dataSource)
{
    private static readonly Regex DomainRegex = new(
        @"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public async Task<long?> EnsurePropertyFromStartUrlAsync(string startUrl, CancellationToken cancellationToken = default)
    {
        var domain = CanonicalDomainFromStartUrl(startUrl);
        if (domain is null || !IsValidCanonicalDomain(domain))
        {
            return null;
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var select = new NpgsqlCommand(
            "SELECT id FROM properties WHERE canonical_domain = @domain LIMIT 1",
            conn);
        select.Parameters.AddWithValue("domain", domain);
        var existing = await select.ExecuteScalarAsync(cancellationToken);
        if (existing is long id)
        {
            return id;
        }

        if (existing is int intId)
        {
            return intId;
        }

        var name = DerivePropertyName(domain, startUrl);
        await using var insert = new NpgsqlCommand(
            """
            INSERT INTO properties (name, canonical_domain, site_url)
            VALUES (@name, @domain, @siteUrl)
            ON CONFLICT (canonical_domain) DO UPDATE SET site_url = EXCLUDED.site_url
            RETURNING id
            """,
            conn);
        insert.Parameters.AddWithValue("name", name);
        insert.Parameters.AddWithValue("domain", domain);
        insert.Parameters.AddWithValue("siteUrl", startUrl.Trim());
        var inserted = await insert.ExecuteScalarAsync(cancellationToken);
        return inserted switch
        {
            long l => l,
            int i => i,
            _ => null,
        };
    }

    internal static string? CanonicalDomainFromStartUrl(string startUrl)
    {
        if (!Uri.TryCreate(startUrl.Trim(), UriKind.Absolute, out var uri))
        {
            return null;
        }

        var host = uri.Host.Trim().ToLowerInvariant();
        if (host.StartsWith("www.", StringComparison.Ordinal))
        {
            host = host[4..];
        }

        return string.IsNullOrWhiteSpace(host) ? null : host;
    }

    internal static bool IsValidCanonicalDomain(string domain) => DomainRegex.IsMatch(domain);

    private static string DerivePropertyName(string domain, string startUrl)
    {
        if (!string.IsNullOrWhiteSpace(domain))
        {
            return domain;
        }

        return startUrl.Trim();
    }
}
