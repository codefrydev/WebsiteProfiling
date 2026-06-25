using System.Text.Json;
using AiService.Domain.Repositories;
using AiService.Tools.Domain;
using AiService.Tools.Registry;
using Microsoft.Extensions.Caching.Memory;

namespace AiService.Tools.Selection;

/// <summary>
/// Resolves which audit tools are enabled from pipeline config, env, and per-tool opt-outs.
/// Shared by MCP, chat, and <c>/api/mcp-tools</c>.
/// </summary>
public sealed class AuditToolSelectionService(
    IPipelineConfigReader pipelineConfigReader,
    ToolCatalog catalog,
    IMemoryCache cache)
{
    private static readonly TimeSpan ConfigCacheTtl = TimeSpan.FromSeconds(30);

    public async Task<AuditToolSelectionSnapshot> GetSnapshotAsync(CancellationToken cancellationToken = default)
    {
        return await cache.GetOrCreateAsync(
            "audit-tool-selection",
            async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = ConfigCacheTtl;
                return await BuildSnapshotAsync(cancellationToken);
            }) ?? await BuildSnapshotAsync(cancellationToken);
    }

    public async Task<IReadOnlySet<string>> GetEnabledToolNamesAsync(CancellationToken cancellationToken = default)
    {
        var snapshot = await GetSnapshotAsync(cancellationToken);
        return snapshot.EnabledToolNames;
    }

    public async Task<bool> IsToolEnabledAsync(string toolName, CancellationToken cancellationToken = default)
    {
        var snapshot = await GetSnapshotAsync(cancellationToken);
        return snapshot.EnabledToolNames.Contains(toolName);
    }

    private async Task<AuditToolSelectionSnapshot> BuildSnapshotAsync(CancellationToken cancellationToken)
    {
        IReadOnlyDictionary<string, string> pipeline;
        try
        {
            pipeline = await pipelineConfigReader.LoadAsync(cancellationToken);
        }
        catch
        {
            pipeline = new Dictionary<string, string>(StringComparer.Ordinal);
        }

        var bundleKey = ResolveBundleKey(pipeline);
        var enabledDomains = ResolveEnabledDomains(pipeline, bundleKey);
        var disabledTools = ParseDisabledTools(pipeline.GetValueOrDefault("mcp_disabled_tools"));
        var allNames = catalog.ToolNames.ToHashSet(StringComparer.Ordinal);

        HashSet<string> baseNames;
        if (string.Equals(bundleKey, "custom", StringComparison.Ordinal))
        {
            baseNames = McpToolDomains.ToolNamesForEnabledDomains(allNames, enabledDomains);
        }
        else if (string.Equals(bundleKey, "full", StringComparison.Ordinal))
        {
            baseNames = allNames;
            baseNames.ExceptWith(McpToolDomains.ChatOnlyTools);
        }
        else
        {
            baseNames = McpToolDomains.ToolNamesForMcpBundle(allNames, bundleKey);
        }

        baseNames.ExceptWith(disabledTools);

        return new AuditToolSelectionSnapshot(
            bundleKey,
            enabledDomains,
            disabledTools,
            baseNames,
            GroupToolsByDomain(baseNames));
    }

    public static string ResolveBundleKey(IReadOnlyDictionary<string, string> pipeline)
    {
        var env = Environment.GetEnvironmentVariable("WP_MCP_DOMAIN")?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(env))
        {
            return NormalizeBundleKey(env);
        }

        var db = pipeline.GetValueOrDefault("mcp_domain")?.Trim().ToLowerInvariant();
        return NormalizeBundleKey(string.IsNullOrEmpty(db) ? "core" : db);
    }

    public static string NormalizeBundleKey(string raw)
    {
        var key = raw.Trim().ToLowerInvariant();
        if (key is "core" or "crawl" or "google" or "links" or "full" or "custom")
        {
            return key;
        }

        return "core";
    }

    public static IReadOnlyList<string> ResolveEnabledDomains(
        IReadOnlyDictionary<string, string> pipeline,
        string bundleKey)
    {
        if (!string.Equals(bundleKey, "custom", StringComparison.Ordinal))
        {
            if (McpToolDomains.McpDomainBundles.TryGetValue(bundleKey, out var bundleDomains))
            {
                return bundleDomains.Order(StringComparer.Ordinal).ToList();
            }

            return ["core", "insight"];
        }

        var raw = pipeline.GetValueOrDefault("mcp_enabled_domains");
        var parsed = ParseDomainList(raw);
        if (parsed.Count == 0)
        {
            return ["core", "insight"];
        }

        return parsed;
    }

    public static HashSet<string> ParseDisabledTools(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }

        try
        {
            var list = JsonSerializer.Deserialize<List<string>>(raw);
            return list?.ToHashSet(StringComparer.Ordinal) ?? new HashSet<string>(StringComparer.Ordinal);
        }
        catch (JsonException)
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }
    }

    public static List<string> ParseDomainList(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            var jsonList = JsonSerializer.Deserialize<List<string>>(raw);
            if (jsonList is not null)
            {
                return jsonList
                    .Select(d => d.Trim().ToLowerInvariant())
                    .Where(McpToolDomains.CanonicalDomains.Contains)
                    .Distinct(StringComparer.Ordinal)
                    .Order(StringComparer.Ordinal)
                    .ToList();
            }
        }
        catch (JsonException)
        {
            /* fall through to comma-separated */
        }

        return raw
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(d => d.ToLowerInvariant())
            .Where(McpToolDomains.CanonicalDomains.Contains)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToList();
    }

    public static Dictionary<string, IReadOnlyList<string>> GroupToolsByDomain(IEnumerable<string> toolNames)
    {
        var map = McpToolDomains.CanonicalDomains.ToDictionary(
            d => d,
            _ => (IReadOnlyList<string>)Array.Empty<string>(),
            StringComparer.Ordinal);

        var buckets = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var name in toolNames)
        {
            var domain = McpToolDomains.ClassifyToolDomain(name);
            if (!buckets.TryGetValue(domain, out var list))
            {
                list = [];
                buckets[domain] = list;
            }

            list.Add(name);
        }

        foreach (var (domain, list) in buckets)
        {
            list.Sort(StringComparer.Ordinal);
            map[domain] = list;
        }

        return map;
    }
}

public sealed record AuditToolSelectionSnapshot(
    string BundleKey,
    IReadOnlyList<string> EnabledDomains,
    IReadOnlySet<string> DisabledTools,
    IReadOnlySet<string> EnabledToolNames,
    IReadOnlyDictionary<string, IReadOnlyList<string>> ToolsByDomain);
