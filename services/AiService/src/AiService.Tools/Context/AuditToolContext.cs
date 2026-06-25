using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;

namespace AiService.Tools.Context;

/// <summary>
/// Execution context for audit tools (property + report scope). Mirrors Python
/// <c>website_profiling.tools.audit_tools.context.AuditToolContext</c>.
/// </summary>
public sealed class AuditToolContext
{
    public int? PropertyId { get; init; }

    public int? ReportId { get; init; }

    /// <summary>
    /// Load the report JSON blob from <c>report_payload</c>. When <see cref="ReportId"/> is null,
    /// returns the latest report (ORDER BY id DESC LIMIT 1), matching Python <c>read_report_payload</c>.
    /// </summary>
    public async Task<JsonObject> LoadPayloadAsync(NpgsqlConnection conn, CancellationToken cancellationToken = default)
    {
        await using var cmd = conn.CreateCommand();
        if (ReportId is int reportId)
        {
            cmd.CommandText = "SELECT data FROM report_payload WHERE id = @id";
            cmd.Parameters.AddWithValue("id", reportId);
        }
        else
        {
            cmd.CommandText = "SELECT data FROM report_payload ORDER BY id DESC LIMIT 1";
        }

        var raw = await cmd.ExecuteScalarAsync(cancellationToken);
        if (raw is null or DBNull)
        {
            return [];
        }

        var text = raw switch
        {
            string s => s,
            byte[] bytes => System.Text.Encoding.UTF8.GetString(bytes),
            _ => raw.ToString() ?? "{}",
        };

        try
        {
            return JsonNode.Parse(text) as JsonObject ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>
    /// Latest Google snapshot for the property as report_payload["google"] shape (gsc_full/ga4_full
    /// stripped). Falls back to the embedded payload blob. Mirrors Python <c>load_google</c>.
    /// </summary>
    public async Task<JsonObject?> LoadGoogleAsync(NpgsqlConnection conn, CancellationToken cancellationToken = default)
    {
        var latest = await ReadLatestGoogleAsync(conn, offset: 0, cancellationToken);
        if (latest is not null)
        {
            return StripFullBlobs(latest);
        }

        var payload = await LoadPayloadAsync(conn, cancellationToken);
        return payload["google"] as JsonObject;
    }

    /// <summary>Latest Google snapshot including gsc_full/ga4_full. Mirrors Python <c>load_google_full</c>.</summary>
    public async Task<JsonObject?> LoadGoogleFullAsync(NpgsqlConnection conn, CancellationToken cancellationToken = default)
    {
        var latest = await ReadLatestGoogleAsync(conn, offset: 0, cancellationToken);
        if (latest is not null)
        {
            return latest;
        }

        var payload = await LoadPayloadAsync(conn, cancellationToken);
        return payload["google"] as JsonObject;
    }

    /// <summary>(current, prior) full Google snapshots for decay/compare tools. Mirrors <c>load_google_pair</c>.</summary>
    public async Task<(JsonObject? Current, JsonObject? Prior)> LoadGooglePairAsync(
        NpgsqlConnection conn,
        CancellationToken cancellationToken = default)
    {
        var current = await ReadLatestGoogleAsync(conn, offset: 0, cancellationToken);
        var prior = await ReadLatestGoogleAsync(conn, offset: 1, cancellationToken);
        if (current is null)
        {
            var payload = await LoadPayloadAsync(conn, cancellationToken);
            current = payload["google"] as JsonObject;
        }

        return (current, prior);
    }

    /// <summary>Latest keyword snapshot for the property (rows capped at 1000). Mirrors <c>load_keywords</c>.</summary>
    public async Task<JsonObject?> LoadKeywordsAsync(NpgsqlConnection conn, CancellationToken cancellationToken = default)
    {
        if (PropertyId is int pid)
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT data FROM keyword_data WHERE property_id = @pid ORDER BY id DESC LIMIT 1";
            cmd.Parameters.AddWithValue("pid", pid);
            var data = await ReadDataObjectAsync(cmd, cancellationToken);
            if (data is not null)
            {
                if (data["rows"] is JsonArray rows && rows.Count > 1000)
                {
                    var capped = new JsonArray();
                    for (var i = 0; i < 1000; i++)
                    {
                        capped.Add(rows[i]?.DeepClone());
                    }

                    data["rows"] = capped;
                }

                return data;
            }
        }

        var payload = await LoadPayloadAsync(conn, cancellationToken);
        return payload["keywords"] as JsonObject;
    }

    /// <summary>Latest GSC links snapshot for the property (full, uncapped). Mirrors <c>load_gsc_links</c>.</summary>
    public async Task<JsonObject?> LoadGscLinksAsync(NpgsqlConnection conn, CancellationToken cancellationToken = default)
    {
        if (PropertyId is int pid)
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT data FROM gsc_links_data WHERE property_id = @pid ORDER BY id DESC LIMIT 1";
            cmd.Parameters.AddWithValue("pid", pid);
            var data = await ReadDataObjectAsync(cmd, cancellationToken);
            if (data is not null)
            {
                return data;
            }
        }

        var payload = await LoadPayloadAsync(conn, cancellationToken);
        return payload["gsc_links"] as JsonObject;
    }

    /// <summary>Report payload blob by explicit id. Mirrors Python <c>load_report_payload_by_id</c>.</summary>
    public async Task<JsonObject> LoadReportPayloadByIdAsync(
        NpgsqlConnection conn,
        int reportId,
        CancellationToken cancellationToken = default)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT data FROM report_payload WHERE id = @id";
        cmd.Parameters.AddWithValue("id", reportId);
        return await ReadDataObjectAsync(cmd, cancellationToken) ?? [];
    }

    /// <summary>Canonical domain for the property (properties table → payload → top page host). Mirrors <c>resolve_property_domain</c>.</summary>
    public async Task<string> ResolvePropertyDomainAsync(NpgsqlConnection conn, CancellationToken cancellationToken = default)
    {
        if (PropertyId is int pid)
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT canonical_domain FROM properties WHERE id = @id";
            cmd.Parameters.AddWithValue("id", pid);
            var raw = await cmd.ExecuteScalarAsync(cancellationToken);
            var domain = (raw as string ?? "").Trim().ToLowerInvariant();
            if (!string.IsNullOrEmpty(domain))
            {
                return domain;
            }
        }

        var payload = await LoadPayloadAsync(conn, cancellationToken);
        if (payload["canonical_domain"] is JsonValue cv && cv.TryGetValue<string>(out var canonical))
        {
            var value = (canonical ?? "").Trim().ToLowerInvariant();
            if (!string.IsNullOrEmpty(value))
            {
                return value;
            }
        }

        if (payload["top_pages"] is JsonArray topPages
            && topPages.Count > 0
            && topPages[0] is JsonObject first
            && first["url"] is JsonValue urlValue
            && urlValue.TryGetValue<string>(out var url)
            && !string.IsNullOrWhiteSpace(url)
            && Uri.TryCreate(url, UriKind.Absolute, out var uri)
            && !string.IsNullOrEmpty(uri.Host))
        {
            return uri.Host.ToLowerInvariant();
        }

        return "";
    }

    /// <summary>
    /// All crawl result rows for the run, as records-orient JsonObjects (url + fetch_method columns
    /// merged with all fields from the data JSONB blob). Run id comes from payload.crawl_run_id,
    /// then latest crawl run, then all results. Mirrors Python <c>load_crawl_df / read_crawl</c>.
    /// </summary>
    public async Task<IReadOnlyList<JsonObject>> LoadCrawlDfAsync(
        NpgsqlConnection conn,
        CancellationToken cancellationToken = default)
    {
        var payload = await LoadPayloadAsync(conn, cancellationToken);
        var runId = ResolveCrawlRunId(payload);

        if (runId is null)
        {
            runId = await GetLatestCrawlRunIdAsync(conn, cancellationToken);
        }

        await using var cmd = conn.CreateCommand();
        if (runId is int rid)
        {
            cmd.CommandText = "SELECT url, fetch_method, data FROM crawl_results WHERE crawl_run_id = @rid";
            cmd.Parameters.AddWithValue("rid", rid);
        }
        else
        {
            cmd.CommandText = "SELECT url, fetch_method, data FROM crawl_results";
        }

        return await ReadCrawlRowsAsync(cmd, cancellationToken);
    }

    private static int? ResolveCrawlRunId(JsonObject payload)
    {
        if (payload["crawl_run_id"] is not JsonValue v)
        {
            return null;
        }

        if (v.TryGetValue<int>(out var i))
        {
            return i;
        }

        if (v.TryGetValue<double>(out var d))
        {
            return (int)d;
        }

        if (v.TryGetValue<long>(out var l))
        {
            return (int)l;
        }

        if (v.TryGetValue<string>(out var s) && int.TryParse(s, out var p))
        {
            return p;
        }

        return null;
    }

    private static async Task<int?> GetLatestCrawlRunIdAsync(NpgsqlConnection conn, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT id FROM crawl_runs ORDER BY id DESC LIMIT 1";
        var raw = await cmd.ExecuteScalarAsync(ct);
        return raw is null or DBNull ? null : Convert.ToInt32(raw);
    }

    private static async Task<IReadOnlyList<JsonObject>> ReadCrawlRowsAsync(NpgsqlCommand cmd, CancellationToken ct)
    {
        var rows = new List<JsonObject>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var row = new JsonObject();
            row["url"] = reader.IsDBNull(0) ? "" : reader.GetString(0);

            var fm = reader.IsDBNull(1) ? "" : reader.GetString(1).Trim();
            row["fetch_method"] = fm.Length > 0 ? fm : "static";

            if (!reader.IsDBNull(2))
            {
                try
                {
                    if (JsonNode.Parse(reader.GetString(2)) is JsonObject blob)
                    {
                        foreach (var (k, v) in blob)
                        {
                            row[k] = v?.DeepClone();
                        }
                    }
                }
                catch (JsonException) { }
            }

            rows.Add(row);
        }

        return rows;
    }

    private async Task<JsonObject?> ReadLatestGoogleAsync(NpgsqlConnection conn, int offset, CancellationToken cancellationToken)
    {
        await using var cmd = conn.CreateCommand();
        if (PropertyId is int pid)
        {
            cmd.CommandText = "SELECT data FROM google_data WHERE property_id = @pid ORDER BY id DESC OFFSET @off LIMIT 1";
            cmd.Parameters.AddWithValue("pid", pid);
        }
        else
        {
            cmd.CommandText = "SELECT data FROM google_data ORDER BY id DESC OFFSET @off LIMIT 1";
        }

        cmd.Parameters.AddWithValue("off", Math.Max(0, offset));
        return await ReadDataObjectAsync(cmd, cancellationToken);
    }

    private static async Task<JsonObject?> ReadDataObjectAsync(NpgsqlCommand cmd, CancellationToken cancellationToken)
    {
        var raw = await cmd.ExecuteScalarAsync(cancellationToken);
        if (raw is null or DBNull)
        {
            return null;
        }

        var text = raw switch
        {
            string s => s,
            byte[] bytes => System.Text.Encoding.UTF8.GetString(bytes),
            _ => raw.ToString() ?? string.Empty,
        };

        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        try
        {
            return JsonNode.Parse(text) as JsonObject;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static JsonObject StripFullBlobs(JsonObject data)
    {
        var output = new JsonObject();
        foreach (var (key, value) in data)
        {
            if (key is "gsc_full" or "ga4_full")
            {
                continue;
            }

            output[key] = value?.DeepClone();
        }

        return output;
    }

    /// <summary>Merge tool args <c>property_id</c> / <c>report_id</c> when provided.</summary>
    public AuditToolContext WithArgs(JsonObject args)
    {
        var propertyId = PropertyId;
        var reportId = ReportId;

        if (args.TryGetPropertyValue("property_id", out var pidNode) && pidNode is not null)
        {
            if (pidNode is JsonValue pidValue && pidValue.TryGetValue(out int pidInt))
            {
                propertyId = pidInt;
            }
            else if (int.TryParse(pidNode.ToString(), out var parsedPid))
            {
                propertyId = parsedPid;
            }
        }

        if (args.TryGetPropertyValue("report_id", out var ridNode) && ridNode is not null)
        {
            if (ridNode is JsonValue ridValue && ridValue.TryGetValue(out int ridInt))
            {
                reportId = ridInt;
            }
            else if (int.TryParse(ridNode.ToString(), out var parsedRid))
            {
                reportId = parsedRid;
            }
        }

        return new AuditToolContext { PropertyId = propertyId, ReportId = reportId };
    }
}
