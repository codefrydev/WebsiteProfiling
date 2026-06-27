namespace ReportService.Application.Build;

/// <summary>
/// Edge-list helpers for report build. Full edge extraction (HTTP fetch) remains in Python until ported.
/// </summary>
public static class EdgesBuilder
{
    private static readonly HashSet<string> LinkColumnNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "outlink_targets",
        "outlinks_list",
        "links",
        "internal_links",
    };

    public static IReadOnlyList<(string From, string To)> BuildFromSerializedColumns(
        IReadOnlyList<CrawlRowEdgesInput> rows,
        bool sameDomainOnly)
    {
        var edges = new List<(string From, string To)>();
        if (rows.Count == 0)
        {
            return edges;
        }

        var columns = rows[0].LinkColumns.Keys
            .Where(c => LinkColumnNames.Contains(c) && !c.Equals("outlinks", StringComparison.OrdinalIgnoreCase))
            .ToList();

        foreach (var col in columns)
        {
            var hasData = rows.Any(r =>
                r.LinkColumns.TryGetValue(col, out var raw) && !string.IsNullOrWhiteSpace(raw));
            if (!hasData)
            {
                continue;
            }

            foreach (var row in rows)
            {
                if (!row.LinkColumns.TryGetValue(col, out var raw) || string.IsNullOrWhiteSpace(raw))
                {
                    continue;
                }

                foreach (var target in ParseLinksSerialized(raw))
                {
                    if (string.IsNullOrWhiteSpace(target))
                    {
                        continue;
                    }

                    if (sameDomainOnly && !SameDomain(row.Url, target))
                    {
                        continue;
                    }

                    edges.Add((row.Url, target));
                }
            }

            if (edges.Count > 0)
            {
                return edges;
            }
        }

        return edges;
    }

    public static IEnumerable<string> ParseLinksSerialized(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            yield break;
        }

        var trimmed = raw.Trim();
        if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
        {
            trimmed = trimmed[1..^1];
        }

        foreach (var part in trimmed.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var link = part.Trim().Trim('"', '\'');
            if (!string.IsNullOrWhiteSpace(link))
            {
                yield return link;
            }
        }
    }

    private static bool SameDomain(string a, string b)
    {
        if (!Uri.TryCreate(a, UriKind.Absolute, out var ua) || !Uri.TryCreate(b, UriKind.Absolute, out var ub))
        {
            return false;
        }

        return string.Equals(ua.Host, ub.Host, StringComparison.OrdinalIgnoreCase);
    }
}

public sealed record CrawlRowEdgesInput(string Url, IReadOnlyDictionary<string, string> LinkColumns);
