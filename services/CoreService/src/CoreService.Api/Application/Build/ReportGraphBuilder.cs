using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build;

public sealed record ReportGraphResult(
    List<string> GraphNodes,
    List<Dictionary<string, string>> GraphEdges,
    List<Dictionary<string, object?>> TopPages);

/// <summary>Internal link graph + top pages (Python networkx pagerank parity, no external deps).</summary>
public static class ReportGraphBuilder
{
    public static ReportGraphResult Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyList<(string From, string To)> edges,
        int maxNodesPlot = 300)
    {
        if (edges.Count == 0)
        {
            return BuildFromOutlinks(rows);
        }

        var nodes = new HashSet<string>(StringComparer.Ordinal);
        var adjacency = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var inNeighbors = new Dictionary<string, List<string>>(StringComparer.Ordinal);

        foreach (var row in rows)
        {
            if (!string.IsNullOrWhiteSpace(row.Url))
            {
                nodes.Add(row.Url.Trim());
            }
        }

        foreach (var (from, to) in edges)
        {
            nodes.Add(from);
            nodes.Add(to);
            adjacency.TryAdd(from, []);
            adjacency[from].Add(to);
            inNeighbors.TryAdd(to, []);
            inNeighbors[to].Add(from);
        }

        var pagerank = ComputePageRank(nodes, adjacency);
        var degree = nodes.ToDictionary(n => n, n => (adjacency.GetValueOrDefault(n)?.Count ?? 0) + (inNeighbors.GetValueOrDefault(n)?.Count ?? 0));

        var nodeFrequency = edges
            .SelectMany(e => new[] { e.From, e.To })
            .GroupBy(u => u)
            .OrderByDescending(g => g.Count())
            .Take(maxNodesPlot)
            .Select(g => g.Key)
            .ToHashSet(StringComparer.Ordinal);

        var graphEdges = edges
            .Where(e => nodeFrequency.Contains(e.From) && nodeFrequency.Contains(e.To))
            .Select(e => new Dictionary<string, string> { ["from"] = e.From, ["to"] = e.To })
            .ToList();
        if (graphEdges.Count == 0)
        {
            graphEdges = edges
                .Where(e => nodeFrequency.Contains(e.From) || nodeFrequency.Contains(e.To))
                .Select(e => new Dictionary<string, string> { ["from"] = e.From, ["to"] = e.To })
                .ToList();
        }

        var titles = rows.ToDictionary(r => r.Url.Trim(), r => r.Title ?? r.Url, StringComparer.Ordinal);
        var topPages = pagerank
            .OrderByDescending(kv => kv.Value)
            .Take(15)
            .Select(kv =>
            {
                var score = Math.Round(kv.Value, 5);
                return new Dictionary<string, object?>
                {
                    ["url"] = kv.Key,
                    ["title"] = titles.GetValueOrDefault(kv.Key) ?? kv.Key,
                    ["pagerank"] = score,
                    ["internal_link_score"] = score,
                    ["degree"] = degree.GetValueOrDefault(kv.Key),
                };
            })
            .ToList();

        return new ReportGraphResult(nodeFrequency.ToList(), graphEdges, topPages);
    }

    private static ReportGraphResult BuildFromOutlinks(IReadOnlyList<CrawlRow> rows)
    {
        var topPages = rows
            .Where(r => !string.IsNullOrWhiteSpace(r.Url))
            .OrderByDescending(r => r.Outlinks ?? 0)
            .Take(15)
            .Select(r => new Dictionary<string, object?>
            {
                ["url"] = r.Url,
                ["title"] = string.IsNullOrWhiteSpace(r.Title) ? r.Url : r.Title,
                ["outlinks"] = r.Outlinks ?? 0,
                ["pagerank"] = 0.0,
                ["degree"] = r.Outlinks ?? 0,
            })
            .ToList();

        return new ReportGraphResult([], [], topPages);
    }

    private static Dictionary<string, double> ComputePageRank(
        IEnumerable<string> nodes,
        IReadOnlyDictionary<string, List<string>> adjacency,
        double damping = 0.85,
        int maxIterations = 200)
    {
        var nodeList = nodes.Distinct(StringComparer.Ordinal).ToList();
        var n = nodeList.Count;
        if (n == 0)
        {
            return new Dictionary<string, double>(StringComparer.Ordinal);
        }

        var ranks = nodeList.ToDictionary(u => u, _ => 1.0 / n, StringComparer.Ordinal);
        var outDegree = nodeList.ToDictionary(
            u => u,
            u => Math.Max(1, adjacency.GetValueOrDefault(u)?.Count ?? 0),
            StringComparer.Ordinal);

        for (var iter = 0; iter < maxIterations; iter++)
        {
            var next = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var node in nodeList)
            {
                var sum = 0.0;
                foreach (var (src, targets) in adjacency)
                {
                    if (targets.Contains(node))
                    {
                        sum += ranks[src] / outDegree[src];
                    }
                }

                next[node] = (1 - damping) / n + damping * sum;
            }

            ranks = next;
        }

        return ranks;
    }
}
