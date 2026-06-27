using System.Text.Json.Nodes;
using AiService.Tools.Domain;
using AiService.Tools.Registry;

namespace AiService.Tools.Selection;

/// <summary>Keyword search over tool catalog — ports Python <c>registry.search_tools</c>.</summary>
public static class ToolCatalogSearch
{
    public static IReadOnlyList<JsonObject> Search(ToolCatalog catalog, string query, int limit = 10)
    {
        var q = (query ?? "").Trim().ToLowerInvariant();
        if (q.Length == 0)
        {
            return [];
        }

        var tokens = q.Replace('/', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var scored = new List<(int Score, string Name, JsonObject Row)>();

        foreach (var name in catalog.ToolNames)
        {
            if (!catalog.TryGetDefinition(name, out var definition) || definition is null)
            {
                continue;
            }

            var fn = definition["function"] as JsonObject;
            var desc = (fn?["description"]?.GetValue<string>() ?? "").ToLowerInvariant();
            var domain = McpToolDomains.ClassifyToolDomain(name);
            var haystack = $"{name} {desc} {domain}".ToLowerInvariant();

            var score = 0;
            if (name.Contains(q, StringComparison.Ordinal))
            {
                score += 100;
            }

            if (haystack.Contains(q, StringComparison.Ordinal))
            {
                score += 40;
            }

            foreach (var tok in tokens)
            {
                if (name.Contains(tok, StringComparison.Ordinal))
                {
                    score += 30;
                }
                else if (haystack.Contains(tok, StringComparison.Ordinal))
                {
                    score += 10;
                }
            }

            if (score <= 0)
            {
                continue;
            }

            scored.Add((score, name, new JsonObject
            {
                ["name"] = name,
                ["description"] = fn?["description"]?.GetValue<string>() ?? "",
                ["domain"] = domain,
                ["tier"] = McpToolDomains.Tier0Tools.Contains(name) ? 0 : 1,
            }));
        }

        var cap = Math.Clamp(limit, 1, 50);
        return scored
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Name, StringComparer.Ordinal)
            .Take(cap)
            .Select(x => x.Row)
            .ToList();
    }
}
