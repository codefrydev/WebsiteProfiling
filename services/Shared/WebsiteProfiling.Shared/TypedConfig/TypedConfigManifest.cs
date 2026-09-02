using System.Text.Json;

namespace WebsiteProfiling.TypedConfig;

/// <summary>Manifest-driven routing for typed Postgres config tables.</summary>
public sealed class TypedConfigManifest
{
    private static readonly Lazy<TypedConfigManifest> Instance = new(Load);

    public static TypedConfigManifest Current => Instance.Value;

    public IReadOnlyDictionary<string, ConfigRoute> StateKeyToRoute { get; }
    public IReadOnlyDictionary<string, IReadOnlyList<string>> DomainTables { get; }
    public IReadOnlyDictionary<string, IReadOnlyDictionary<string, ColumnSpec>> TableColumns { get; }
    public IReadOnlyDictionary<string, string> DomainResponseKeys { get; }

    public static readonly string[] PipelineSingletonTables =
    [
        "integration_secrets",
        "mcp_settings",
        "feature_flags",
        "workspace_settings",
    ];

    private TypedConfigManifest(
        IReadOnlyDictionary<string, ConfigRoute> stateKeyToRoute,
        IReadOnlyDictionary<string, IReadOnlyList<string>> domainTables,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, ColumnSpec>> tableColumns,
        IReadOnlyDictionary<string, string> domainResponseKeys)
    {
        StateKeyToRoute = stateKeyToRoute;
        DomainTables = domainTables;
        TableColumns = tableColumns;
        DomainResponseKeys = domainResponseKeys;
    }

    public static string ResolveManifestPath()
    {
        var root = Environment.GetEnvironmentVariable("WEBSITE_PROFILING_ROOT");
        if (!string.IsNullOrWhiteSpace(root))
        {
            var fromEnv = Path.Combine(root.Trim(), "config", "typed_config_manifest.json");
            if (File.Exists(fromEnv))
            {
                return fromEnv;
            }
        }

        var dir = AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            var candidate = Path.Combine(dir, "config", "typed_config_manifest.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            dir = Directory.GetParent(dir)?.FullName ?? "";
        }

        throw new InvalidOperationException("typed_config_manifest.json not found");
    }

    private static TypedConfigManifest Load()
    {
        using var stream = File.OpenRead(ResolveManifestPath());
        using var doc = JsonDocument.Parse(stream);
        var rootEl = doc.RootElement;

        var stateKeyToRoute = new Dictionary<string, ConfigRoute>(StringComparer.Ordinal);
        var domainTables = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
        var tableColumns = new Dictionary<string, IReadOnlyDictionary<string, ColumnSpec>>(StringComparer.Ordinal);
        var domainResponseKeys = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["crawl_settings"] = "crawl",
            ["report_settings"] = "report",
            ["lighthouse_settings"] = "lighthouse",
            ["content_analysis_settings"] = "analysis",
            ["audit_step_settings"] = "auditSteps",
            ["google_pipeline_settings"] = "google",
            ["keyword_settings"] = "keywords",
        };

        if (rootEl.TryGetProperty("pipeline_domain_tables", out var domains))
        {
            foreach (var tableProp in domains.EnumerateObject())
            {
                var table = tableProp.Name;
                var columns = tableProp.Value.EnumerateArray()
                    .Select(k => k.GetString() ?? "")
                    .Where(k => k.Length > 0)
                    .ToList();
                domainTables[table] = columns;
                foreach (var column in columns)
                {
                    stateKeyToRoute[column] = new ConfigRoute("domain", table, column);
                }
            }
        }

        if (rootEl.TryGetProperty("tables", out var tablesEl))
        {
            foreach (var tableProp in tablesEl.EnumerateObject())
            {
                var tableName = tableProp.Name;
                if (!tableProp.Value.TryGetProperty("columns", out var columnsEl))
                {
                    continue;
                }

                var specs = new Dictionary<string, ColumnSpec>(StringComparer.Ordinal);
                foreach (var colProp in columnsEl.EnumerateObject())
                {
                    var colName = colProp.Name;
                    var colEl = colProp.Value;
                    var type = colEl.TryGetProperty("type", out var typeEl) ? typeEl.GetString() ?? "text" : "text";
                    var stateKey = colEl.TryGetProperty("state_key", out var stateEl) ? stateEl.GetString() : null;
                    var appKey = colEl.TryGetProperty("app_key", out var appEl) ? appEl.GetString() : null;
                    var nullable = colEl.TryGetProperty("nullable", out var nullEl) && nullEl.GetBoolean();
                    object? defaultValue = ParseDefault(colEl);

                    specs[colName] = new ColumnSpec(type, stateKey, appKey, nullable, defaultValue);

                    if (stateKey is { Length: > 0 }
                        && tableName is "integration_secrets" or "mcp_settings" or "feature_flags" or "workspace_settings")
                    {
                        stateKeyToRoute[stateKey] = new ConfigRoute("singleton", tableName, colName);
                    }
                }

                tableColumns[tableName] = specs;
            }
        }

        return new TypedConfigManifest(stateKeyToRoute, domainTables, tableColumns, domainResponseKeys);
    }

    internal static object? ParseDefault(JsonElement colEl)
    {
        if (!colEl.TryGetProperty("default", out var defaultEl))
        {
            return null;
        }

        return defaultEl.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number when defaultEl.TryGetInt32(out var n) => n,
            JsonValueKind.String => defaultEl.GetString(),
            _ => null,
        };
    }

    public sealed record ConfigRoute(string Kind, string Table, string Column);

    public sealed record ColumnSpec(
        string Type,
        string? StateKey,
        string? AppKey,
        bool Nullable,
        object? Default)
    {
        public string? FlatKey => StateKey ?? AppKey;
    }
}
