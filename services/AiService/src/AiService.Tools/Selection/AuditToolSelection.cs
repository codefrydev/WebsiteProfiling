using System.Text.Json;
using AiService.Domain.Models;
using AiService.Domain.Repositories;
using AiService.Tools.Domain;
using AiService.Tools.Registry;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace AiService.Tools.Selection;

/// <summary>
/// Resolves which audit tools are enabled from MCP settings, env, and per-tool opt-outs.
/// Shared by MCP, chat, and <c>/api/mcp-tools</c>.
/// </summary>
public sealed class AuditToolSelectionService(
    IServiceScopeFactory scopeFactory,
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
        McpSettings mcp;
        try
        {
            using var scope = scopeFactory.CreateScope();
            var mcpSettingsRepository = scope.ServiceProvider.GetRequiredService<IMcpSettingsRepository>();
            mcp = await mcpSettingsRepository.LoadAsync(cancellationToken);
        }
        catch
        {
            mcp = new McpSettings();
        }

        var bundleKey = ResolveBundleKey(mcp);
        var enabledDomains = ResolveEnabledDomains(mcp, bundleKey);
        var disabledTools = ParseDisabledTools(mcp.DisabledTools);
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

    public static string ResolveBundleKey(McpSettings mcp)
    {
        var env = Environment.GetEnvironmentVariable("WP_MCP_DOMAIN")?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(env))
        {
            return NormalizeBundleKey(env);
        }

        var db = mcp.ToolBundle.Trim().ToLowerInvariant();
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
        McpSettings mcp,
        string bundleKey)
    {
        if (!string.Equals(bundleKey, "custom", StringComparison.Ordinal))
        {
            if (McpToolDomains.McpDomainBundles.TryGetValue(bundleKey, out var bundleDomains))
            {
                return bundleDomains.Order(StringComparer.Ordinal).ToList();
            }

            return [McpToolDomains.Names.Core, McpToolDomains.Names.Insight];
        }

        var parsed = ParseDomainList(mcp.EnabledDomains);
        if (parsed.Count == 0)
        {
            return [McpToolDomains.Names.Core, McpToolDomains.Names.Insight];
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
