namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/link_edges_report.py.</summary>
public static class LinkEdgesReportBuilder
{
    public static Dictionary<string, object?> SummarizeLinkRel(IReadOnlyList<Dictionary<string, object?>> edges)
    {
        var internalEdges = edges
            .Where(e => string.Equals(e.GetValueOrDefault("link_type")?.ToString(), "internal", StringComparison.Ordinal))
            .ToList();

        return new Dictionary<string, object?>
        {
            ["total_edges"] = edges.Count,
            ["internal_edges"] = internalEdges.Count,
            ["nofollow_internal"] = internalEdges.Count(e => IsTrue(e, "is_nofollow")),
            ["sponsored_internal"] = internalEdges.Count(e => IsTrue(e, "is_sponsored")),
            ["ugc_internal"] = internalEdges.Count(e => IsTrue(e, "is_ugc")),
            ["external_edges"] = edges.Count - internalEdges.Count,
        };
    }

    public static List<Dictionary<string, object?>> BuildInlinkAnchorMatrix(
        IReadOnlyList<Dictionary<string, object?>> edges,
        int limit = 500)
    {
        var buckets = new Dictionary<(string Target, string Anchor), Dictionary<string, int>>(StringTupleComparer.Ordinal);

        foreach (var edge in edges)
        {
            if (!string.Equals(edge.GetValueOrDefault("link_type")?.ToString(), "internal", StringComparison.Ordinal))
            {
                continue;
            }

            var target = (edge.GetValueOrDefault("to_url")?.ToString() ?? "").TrimEnd('/');
            var anchor = (edge.GetValueOrDefault("anchor_text")?.ToString() ?? "").Trim();
            if (string.IsNullOrEmpty(anchor))
            {
                anchor = "(empty)";
            }

            var source = (edge.GetValueOrDefault("from_url")?.ToString() ?? "").TrimEnd('/');
            if (string.IsNullOrEmpty(target) || string.IsNullOrEmpty(source))
            {
                continue;
            }

            var key = (target, anchor);
            if (!buckets.TryGetValue(key, out var positions))
            {
                positions = new Dictionary<string, int>(StringComparer.Ordinal);
                buckets[key] = positions;
            }

            var position = edge.GetValueOrDefault("position")?.ToString() ?? "content";
            positions[position] = positions.GetValueOrDefault(position) + 1;
        }

        return buckets
            .Select(kv =>
            {
                var total = kv.Value.Values.Sum();
                var topPos = kv.Value.OrderByDescending(p => p.Value).FirstOrDefault().Key ?? "content";
                return new Dictionary<string, object?>
                {
                    ["target_url"] = kv.Key.Target,
                    ["anchor_text"] = kv.Key.Anchor,
                    ["inlink_count"] = total,
                    ["top_position"] = topPos,
                };
            })
            .OrderByDescending(r => Convert.ToInt32(r["inlink_count"]))
            .ThenBy(r => r["target_url"]?.ToString(), StringComparer.Ordinal)
            .Take(Math.Max(1, limit))
            .ToList();
    }

    public static List<Dictionary<string, object?>> ToPayloadRows(IReadOnlyList<LinkEdgeRow> rows) =>
        rows.Select(r => new Dictionary<string, object?>
        {
            ["from_url"] = r.FromUrl,
            ["to_url"] = r.ToUrl,
            ["anchor_text"] = r.AnchorText,
            ["rel"] = r.Rel,
            ["is_nofollow"] = r.IsNofollow,
            ["is_sponsored"] = r.IsSponsored,
            ["is_ugc"] = r.IsUgc,
            ["link_type"] = r.LinkType,
            ["position"] = r.Position,
        }).ToList();

    private static bool IsTrue(Dictionary<string, object?> edge, string key) =>
        edge.TryGetValue(key, out var val) && val is true;

    private sealed class StringTupleComparer : IEqualityComparer<(string Target, string Anchor)>
    {
        public static StringTupleComparer Ordinal { get; } = new();

        public bool Equals((string Target, string Anchor) x, (string Target, string Anchor) y) =>
            string.Equals(x.Target, y.Target, StringComparison.Ordinal)
            && string.Equals(x.Anchor, y.Anchor, StringComparison.Ordinal);

        public int GetHashCode((string Target, string Anchor) obj) =>
            HashCode.Combine(obj.Target, obj.Anchor);
    }
}

public sealed record LinkEdgeRow(
    string FromUrl,
    string ToUrl,
    string AnchorText,
    string Rel,
    bool IsNofollow,
    bool IsSponsored,
    bool IsUgc,
    string LinkType,
    string Position);
