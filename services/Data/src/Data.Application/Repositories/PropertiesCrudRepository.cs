using Data.Application.Json;
using Npgsql;
using WebsiteProfiling.Contracts.Properties;

namespace Data.Application.Repositories;

public sealed class PropertiesCrudRepository(NpgsqlDataSource dataSource) : IPropertiesCrudRepository
{
    private const string SelectColumns = """
        id, name, canonical_domain, site_url,
        gsc_site_url, ga4_property_id,
        google_auth_mode, google_refresh_token,
        google_connected_at, google_connected_email,
        google_date_range_days,
        default_crawl_preset, crawl_authorized_at
        """;

    private const string SelectPublicColumns = """
        id, name, canonical_domain, site_url,
        gsc_site_url, ga4_property_id,
        google_auth_mode, google_connected_at, google_connected_email,
        google_date_range_days, crawl_authorized_at
        """;

    public async Task<IReadOnlyList<Dictionary<string, object?>>> ListPublicAsync(
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"""
             SELECT {SelectPublicColumns}
             FROM properties
             ORDER BY name ASC
             """,
            conn);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        var list = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(MapPublicRow(reader));
        }

        return list;
    }

    public async Task<long> UpsertByDomainAsync(
        string name,
        string canonicalDomain,
        string? siteUrl,
        CancellationToken cancellationToken)
    {
        var domain = canonicalDomain.Trim().ToLowerInvariant().TrimEnd('.');
        if (string.IsNullOrEmpty(domain))
        {
            throw new ArgumentException("canonical_domain is required");
        }

        if (!PropertyDomainHelper.IsValidCanonicalDomain(domain))
        {
            throw new ArgumentException($"canonical_domain is not a valid domain: '{domain}'");
        }

        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO properties (name, canonical_domain, site_url, updated_at)
            VALUES (@name, @domain, @siteUrl, now())
            ON CONFLICT (canonical_domain) DO UPDATE SET
                name = EXCLUDED.name,
                site_url = COALESCE(EXCLUDED.site_url, properties.site_url),
                updated_at = now()
            RETURNING id
            """,
            conn);
        cmd.Parameters.AddWithValue("name", string.IsNullOrWhiteSpace(name) ? domain : name.Trim());
        cmd.Parameters.AddWithValue("domain", domain);
        cmd.Parameters.AddWithValue("siteUrl", (object?)siteUrl ?? DBNull.Value);
        var id = await cmd.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt64(id);
    }

    public async Task<long?> EnsureFromStartUrlAsync(string startUrl, CancellationToken cancellationToken)
    {
        var domain = PropertyDomainHelper.CanonicalDomainFromStartUrl(startUrl);
        if (string.IsNullOrEmpty(domain) || !PropertyDomainHelper.IsValidCanonicalDomain(domain))
        {
            return null;
        }

        var existing = await GetByDomainAsync(domain, cancellationToken);
        if (existing is not null)
        {
            return Convert.ToInt64(existing["id"]!);
        }

        return await UpsertByDomainAsync(
            PropertyDomainHelper.DerivePropertyName(domain, startUrl),
            domain,
            startUrl.Trim(),
            cancellationToken);
    }

    public async Task<long?> LookupIdFromStartUrlAsync(string startUrl, CancellationToken cancellationToken)
    {
        var domain = PropertyDomainHelper.CanonicalDomainFromStartUrl(startUrl);
        if (string.IsNullOrEmpty(domain) || !PropertyDomainHelper.IsValidCanonicalDomain(domain))
        {
            return null;
        }

        var prop = await GetByDomainAsync(domain, cancellationToken);
        return prop is null ? null : Convert.ToInt64(prop["id"]!);
    }

    public async Task<Dictionary<string, object?>?> GetByIdAsync(
        long propertyId,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"SELECT {SelectColumns} FROM properties WHERE id = @id",
            conn);
        cmd.Parameters.AddWithValue("id", propertyId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapFullRow(reader) : null;
    }

    public async Task<Dictionary<string, object?>?> GetByDomainAsync(
        string domain,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"SELECT {SelectColumns} FROM properties WHERE canonical_domain = @domain",
            conn);
        cmd.Parameters.AddWithValue("domain", domain.Trim().ToLowerInvariant());
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapFullRow(reader) : null;
    }

    public async Task<bool> DeleteAsync(long propertyId, CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "DELETE FROM properties WHERE id = @id RETURNING id",
            conn);
        cmd.Parameters.AddWithValue("id", propertyId);
        return await cmd.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public async Task<Dictionary<string, object?>?> GetOpsAsync(
        long propertyId,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "SELECT schedule_cron, alert_webhook_url, alert_email FROM properties WHERE id = @id",
            conn);
        cmd.Parameters.AddWithValue("id", propertyId);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new Dictionary<string, object?>
        {
            ["schedule_cron"] = reader.IsDBNull(0) ? null : reader.GetString(0),
            ["alert_webhook_url"] = reader.IsDBNull(1) ? null : reader.GetString(1),
            ["alert_email"] = reader.IsDBNull(2) ? null : reader.GetString(2),
        };
    }

    public async Task UpdateOpsAsync(
        long propertyId,
        string? scheduleCron,
        string? alertWebhookUrl,
        string? alertEmail,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            """
            UPDATE properties
            SET schedule_cron = @scheduleCron,
                alert_webhook_url = @alertWebhookUrl,
                alert_email = @alertEmail,
                updated_at = now()
            WHERE id = @id
            """,
            conn);
        cmd.Parameters.AddWithValue("scheduleCron", (object?)scheduleCron ?? DBNull.Value);
        cmd.Parameters.AddWithValue("alertWebhookUrl", (object?)alertWebhookUrl ?? DBNull.Value);
        cmd.Parameters.AddWithValue("alertEmail", (object?)alertEmail ?? DBNull.Value);
        cmd.Parameters.AddWithValue("id", propertyId);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task UpdateCrawlPresetAsync(
        long propertyId,
        string? preset,
        CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "UPDATE properties SET default_crawl_preset = @preset, updated_at = now() WHERE id = @id",
            conn);
        cmd.Parameters.AddWithValue("preset", (object?)preset ?? DBNull.Value);
        cmd.Parameters.AddWithValue("id", propertyId);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task AuthorizeCrawlAsync(long propertyId, CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            "UPDATE properties SET crawl_authorized_at = now(), updated_at = now() WHERE id = @id",
            conn);
        cmd.Parameters.AddWithValue("id", propertyId);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static Dictionary<string, object?> MapFullRow(NpgsqlDataReader reader) =>
        new()
        {
            ["id"] = reader.GetInt64(0),
            ["name"] = reader.IsDBNull(1) ? null : reader.GetString(1),
            ["canonical_domain"] = reader.IsDBNull(2) ? null : reader.GetString(2),
            ["site_url"] = reader.IsDBNull(3) ? null : reader.GetString(3),
            ["gsc_site_url"] = reader.IsDBNull(4) ? null : reader.GetString(4),
            ["ga4_property_id"] = reader.IsDBNull(5) ? null : reader.GetString(5),
            ["google_auth_mode"] = reader.IsDBNull(6) ? null : reader.GetString(6),
            ["google_refresh_token"] = reader.IsDBNull(7) ? null : reader.GetString(7),
            ["google_connected_at"] = FormatTimestamp(reader, 8),
            ["google_connected_email"] = reader.IsDBNull(9) ? null : reader.GetString(9),
            ["google_date_range_days"] = reader.IsDBNull(10) ? null : reader.GetInt32(10),
            ["default_crawl_preset"] = reader.IsDBNull(11) ? null : reader.GetString(11),
            ["crawl_authorized_at"] = FormatTimestamp(reader, 12),
        };

    private static Dictionary<string, object?> MapPublicRow(NpgsqlDataReader reader)
    {
        var connectedAt = reader.IsDBNull(7) ? null : FormatTimestamp(reader, 7);
        var crawlAuth = reader.IsDBNull(10) ? null : FormatTimestamp(reader, 10);
        return new Dictionary<string, object?>
        {
            ["id"] = reader.GetInt64(0),
            ["name"] = reader.IsDBNull(1) ? null : reader.GetString(1),
            ["canonical_domain"] = reader.IsDBNull(2) ? null : reader.GetString(2),
            ["site_url"] = reader.IsDBNull(3) ? null : reader.GetString(3),
            ["gsc_site_url"] = reader.IsDBNull(4) ? null : reader.GetString(4),
            ["ga4_property_id"] = reader.IsDBNull(5) ? null : reader.GetString(5),
            ["google_auth_mode"] = reader.IsDBNull(6) ? null : reader.GetString(6),
            // Derived for UI/API convenience; Python property store exposes google_connected_at only.
            ["google_connected"] = connectedAt is not null,
            ["google_connected_at"] = connectedAt,
            ["google_connected_email"] = reader.IsDBNull(8) ? null : reader.GetString(8),
            ["google_date_range_days"] = reader.IsDBNull(9) ? null : reader.GetInt32(9),
            ["crawl_authorized_at"] = crawlAuth,
        };
    }

    private static string? FormatTimestamp(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : PyIso.Format(reader.GetFieldValue<DateTimeOffset>(ordinal));
}
