namespace CoreService.Api.Application.Build;

/// <summary>Port of Python integrations/google/competitor_links.build_competitor_link_gap.</summary>
public static class CompetitorLinkGapBuilder
{
    public static Dictionary<string, object?>? Build(
        IReadOnlyDictionary<string, object?>? gscLinks,
        IReadOnlyList<string> competitorDomains)
    {
        if (gscLinks is null || competitorDomains.Count == 0)
        {
            return null;
        }

        var ourDomains = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in JsonObjectParser.AsDictRows(gscLinks.GetValueOrDefault("top_linking_sites")))
        {
            var domain = DomainFromSite(row.GetValueOrDefault("site")?.ToString());
            if (!string.IsNullOrEmpty(domain))
            {
                ourDomains.Add(domain);
            }
        }

        var competitors = competitorDomains
            .Select(DomainFromSite)
            .Where(d => !string.IsNullOrEmpty(d))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (competitors.Count == 0)
        {
            return null;
        }

        var gaps = competitors.Select(comp => ourDomains.Contains(comp)
            ? new Dictionary<string, object?> { ["competitor"] = comp, ["links_to_us"] = true }
            : new Dictionary<string, object?>
            {
                ["competitor"] = comp,
                ["links_to_us"] = false,
                ["note"] = "No referring domain match in imported GSC Links sample.",
            }).Cast<object?>().ToList();

        return new Dictionary<string, object?>
        {
            ["source"] = "gsc_links_import",
            ["provenance"] = "Search Console",
            ["competitors"] = gaps,
            ["our_referring_domain_count"] = ourDomains.Count,
        };
    }

    private static string DomainFromSite(string? site)
    {
        var s = (site ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(s))
        {
            return "";
        }

        if (s.Contains("://", StringComparison.Ordinal) && Uri.TryCreate(s, UriKind.Absolute, out var uri))
        {
            return uri.Host.ToLowerInvariant();
        }

        return s.TrimStart('.');
    }
}
