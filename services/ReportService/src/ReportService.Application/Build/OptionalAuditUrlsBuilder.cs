namespace ReportService.Application.Build;

/// <summary>Bucket category issues into optional_audit_urls lists (Python builder.py message heuristics).</summary>
public static class OptionalAuditUrlsBuilder
{
    public static Dictionary<string, object?> Build(IReadOnlyList<ReportCategory> categories)
    {
        var spell = new List<Dictionary<string, object?>>();
        var html = new List<Dictionary<string, object?>>();
        var amp = new List<Dictionary<string, object?>>();
        var pagination = new List<Dictionary<string, object?>>();

        foreach (var cat in categories)
        {
            foreach (var issue in cat.Issues)
            {
                var msg = issue.Message.ToLowerInvariant();
                var rec = new Dictionary<string, object?>
                {
                    ["url"] = issue.Url ?? "",
                    ["message"] = issue.Message,
                };

                if (msg.Contains("spell", StringComparison.Ordinal))
                {
                    spell.Add(rec);
                }
                else if (msg.Contains("html", StringComparison.Ordinal)
                         && msg.Contains("validation", StringComparison.Ordinal))
                {
                    html.Add(rec);
                }
                else if (msg.Contains("amp", StringComparison.Ordinal))
                {
                    amp.Add(rec);
                }
                else if (msg.Contains("pagination", StringComparison.Ordinal)
                         || msg.Contains("rel=prev", StringComparison.Ordinal)
                         || msg.Contains("rel=next", StringComparison.Ordinal))
                {
                    pagination.Add(rec);
                }
            }
        }

        return new Dictionary<string, object?>
        {
            ["spell"] = spell,
            ["html"] = html,
            ["amp"] = amp,
            ["pagination"] = pagination,
        };
    }
}
