using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Api.Tools.Artifacts;

/// <summary>
/// Temporary export artifact store (<c>DATA_DIR/exports</c>) with TTL. Ports Python
/// <c>website_profiling.tools.export_artifacts</c> so both <c>ChatController.GetArtifact</c> and
/// artifact-producing tool handlers read/write the same on-disk format.
/// </summary>
public static partial class ArtifactStore
{
    private const long TtlSeconds = 24 * 60 * 60;
    private const long InlineMaxBytes = 512 * 1024;

    private static readonly string[] ListRowKeys =
    [
        "pages", "items", "paths", "issues", "issue_deltas", "rows", "keywords", "queries",
        "links", "findings", "technologies", "clusters", "deltas", "results", "broken",
        "redirects", "diagnostics", "categories", "opportunities", "violations_by_rule",
        "poor_performance_pages", "errors", "daily", "by_device", "by_channel",
    ];

    public static string DataDir()
    {
        var raw = Environment.GetEnvironmentVariable("DATA_DIR");
        return string.IsNullOrWhiteSpace(raw) ? Directory.GetCurrentDirectory() : raw.Trim();
    }

    public static string ExportsDir()
    {
        var path = Path.Combine(DataDir(), "exports");
        Directory.CreateDirectory(path);
        return path;
    }

    private static string MetaPath(string artifactId) => Path.Combine(ExportsDir(), $"{artifactId}.meta.json");

    private static string DataPath(string artifactId) => Path.Combine(ExportsDir(), $"{artifactId}.bin");

    public static int SweepExpiredArtifacts()
    {
        var root = ExportsDir();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0;
        var removed = 0;
        foreach (var metaFile in Directory.EnumerateFiles(root, "*.meta.json"))
        {
            try
            {
                var meta = JsonNode.Parse(File.ReadAllText(metaFile)) as JsonObject;
                var created = meta?["created_at_epoch"] is JsonValue v && v.TryGetValue<double>(out var epoch) ? epoch : 0;
                if (created > 0 && now - created > TtlSeconds)
                {
                    var artifactId = meta?["artifact_id"]?.GetValue<string>()
                        ?? Path.GetFileName(metaFile).Replace(".meta.json", "");
                    DeleteArtifact(artifactId);
                    removed++;
                }
            }
            catch (Exception ex) when (ex is IOException or System.Text.Json.JsonException)
            {
                continue;
            }
        }

        return removed;
    }

    public static JsonObject SaveArtifact(string text, string filename, string mimeType, JsonObject? extra = null)
        => SaveArtifact(Encoding.UTF8.GetBytes(text), filename, mimeType, extra);

    public static JsonObject SaveArtifact(byte[] data, string filename, string mimeType, JsonObject? extra = null)
    {
        SweepExpiredArtifacts();
        var artifactId = Guid.NewGuid().ToString();
        var created = DateTimeOffset.UtcNow;
        var record = new JsonObject
        {
            ["artifact_id"] = artifactId,
            ["filename"] = filename,
            ["mime_type"] = mimeType,
            ["size_bytes"] = data.Length,
            ["created_at"] = created.ToString("O"),
            ["created_at_epoch"] = created.ToUnixTimeMilliseconds() / 1000.0,
        };
        if (extra is not null)
        {
            record["extra"] = extra.DeepClone();
        }

        File.WriteAllText(MetaPath(artifactId), record.ToJsonString());
        File.WriteAllBytes(DataPath(artifactId), data);

        var envelope = ArtifactEnvelope(artifactId, record);
        if (data.Length <= InlineMaxBytes && (mimeType.StartsWith("text/", StringComparison.Ordinal) || mimeType.StartsWith("application/json", StringComparison.Ordinal)))
        {
            envelope["content"] = Encoding.UTF8.GetString(data);
        }

        return envelope;
    }

    public static JsonObject ArtifactEnvelope(string artifactId, JsonObject record) => new()
    {
        ["artifact_id"] = artifactId,
        ["filename"] = record["filename"]?.DeepClone(),
        ["mime_type"] = record["mime_type"]?.DeepClone(),
        ["size_bytes"] = record["size_bytes"]?.DeepClone(),
        ["download_path"] = $"/api/chat/artifacts/{artifactId}",
    };

    public static JsonObject? ReadArtifactMeta(string artifactId)
    {
        if (!ArtifactIdRegex().IsMatch(artifactId))
        {
            return null;
        }

        var path = MetaPath(artifactId);
        return File.Exists(path) ? JsonNode.Parse(File.ReadAllText(path)) as JsonObject : null;
    }

    public static (JsonObject Meta, byte[] Bytes)? ReadArtifactBytes(string artifactId)
    {
        var meta = ReadArtifactMeta(artifactId);
        if (meta is null)
        {
            return null;
        }

        var dataPath = DataPath(artifactId);
        return File.Exists(dataPath) ? (meta, File.ReadAllBytes(dataPath)) : null;
    }

    public static void DeleteArtifact(string artifactId)
    {
        foreach (var path in new[] { MetaPath(artifactId), DataPath(artifactId) })
        {
            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch (IOException)
            {
            }
        }
    }

    public static List<JsonObject> RowsFromToolResult(JsonObject result)
    {
        if (result.TryGetPropertyValue("error", out var error) && JsonCoercion.IsTruthy(error))
        {
            return [];
        }

        foreach (var key in ListRowKeys)
        {
            if (result[key] is not JsonArray array || array.Count == 0)
            {
                continue;
            }

            var rows = new List<JsonObject>();
            foreach (var item in array)
            {
                if (item is JsonObject obj)
                {
                    rows.Add(obj);
                }
                else if (item is not null)
                {
                    rows.Add(new JsonObject { ["value"] = item.DeepClone() });
                }
            }

            if (rows.Count > 0)
            {
                return rows;
            }
        }

        return [];
    }

    public static string DictsToCsv(List<JsonObject> rows, IReadOnlyList<string>? columns = null)
    {
        if (rows.Count == 0)
        {
            return "";
        }

        List<string> fieldNames;
        if (columns is { Count: > 0 })
        {
            fieldNames = columns.Where(c => !string.IsNullOrEmpty(c)).ToList();
        }
        else
        {
            var seen = new HashSet<string>();
            fieldNames = [];
            foreach (var row in rows)
            {
                foreach (var key in row.Select(kvp => kvp.Key))
                {
                    if (seen.Add(key))
                    {
                        fieldNames.Add(key);
                    }
                }
            }
        }

        if (fieldNames.Count == 0)
        {
            return "";
        }

        var sb = new StringBuilder();
        sb.Append(string.Join(",", fieldNames.Select(CsvEscape)));
        sb.Append("\r\n");
        foreach (var row in rows)
        {
            sb.Append(string.Join(",", fieldNames.Select(f => CsvEscape(CellToString(row[f])))));
            sb.Append("\r\n");
        }

        return sb.ToString();
    }

    private static string CellToString(JsonNode? node)
    {
        if (node is null)
        {
            return "";
        }

        if (node is JsonValue value)
        {
            if (value.TryGetValue<string>(out var s))
            {
                return s;
            }

            if (value.TryGetValue<bool>(out var b))
            {
                return b ? "True" : "False";
            }

            return value.ToJsonString();
        }

        return node.ToJsonString();
    }

    public static string CsvEscape(string? value)
    {
        value ??= "";
        return value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r')
            ? "\"" + value.Replace("\"", "\"\"") + "\""
            : value;
    }

    [GeneratedRegex(@"^[a-f0-9\-]{36}$")]
    private static partial Regex ArtifactIdRegex();
}
