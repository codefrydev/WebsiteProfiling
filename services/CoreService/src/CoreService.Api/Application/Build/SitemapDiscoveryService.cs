using System.Net.Http.Headers;
using System.Xml.Linq;

namespace CoreService.Api.Application.Build;

/// <summary>Port of Python crawl/sitemap.discover_sitemap_urls (same-origin page URLs).</summary>
public sealed class SitemapDiscoveryService(IHttpClientFactory httpClientFactory)
{
    private const int MaxSitemapUrls = 5000;

    public async Task<IReadOnlyList<string>> DiscoverAsync(
        string startUrl,
        int timeoutSeconds = 12,
        CancellationToken cancellationToken = default)
    {
        if (!Uri.TryCreate(startUrl, UriKind.Absolute, out var startUri)
            || string.IsNullOrEmpty(startUri.Host))
        {
            return [];
        }

        var origin = $"{startUri.Scheme}://{startUri.Authority}";
        var client = httpClientFactory.CreateClient(nameof(SitemapDiscoveryService));
        client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("WebsiteProfilingCrawler", "1.0"));

        var sitemapSeeds = new List<string>();
        try
        {
            var robots = await client.GetStringAsync($"{origin}/robots.txt", cancellationToken);
            sitemapSeeds.AddRange(ParseRobotsSitemaps(robots));
        }
        catch (HttpRequestException)
        {
            // robots optional
        }

        if (sitemapSeeds.Count == 0)
        {
            sitemapSeeds.Add($"{origin}/sitemap.xml");
        }

        var collected = new HashSet<string>(StringComparer.Ordinal);
        var queue = new Queue<string>(sitemapSeeds.Distinct(StringComparer.OrdinalIgnoreCase));
        var visitedSitemaps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        while (queue.Count > 0 && collected.Count < MaxSitemapUrls)
        {
            var smUrl = queue.Dequeue();
            if (!visitedSitemaps.Add(smUrl))
            {
                continue;
            }

            try
            {
                var xml = await client.GetStringAsync(smUrl, cancellationToken);
                var (pages, nested) = ParseSitemapXml(xml, origin);
                foreach (var page in pages)
                {
                    if (SameOrigin(page, origin))
                    {
                        collected.Add(page.Trim());
                    }

                    if (collected.Count >= MaxSitemapUrls)
                    {
                        break;
                    }
                }

                foreach (var nestedUrl in nested)
                {
                    queue.Enqueue(nestedUrl);
                }
            }
            catch (HttpRequestException)
            {
                // skip broken sitemap
            }
        }

        return collected.OrderBy(u => u, StringComparer.Ordinal).ToList();
    }

    private static IEnumerable<string> ParseRobotsSitemaps(string text) =>
        text.Split('\n')
            .Select(l => l.Trim())
            .Where(l => l.StartsWith("Sitemap:", StringComparison.OrdinalIgnoreCase))
            .Select(l => l.Split(':', 2)[1].Trim())
            .Where(u => !string.IsNullOrEmpty(u));

    private static (List<string> Pages, List<string> Nested) ParseSitemapXml(string content, string origin)
    {
        var pages = new List<string>();
        var nested = new List<string>();
        try
        {
            var doc = XDocument.Parse(content);
            var root = doc.Root;
            if (root is null)
            {
                return (pages, nested);
            }

            var localName = root.Name.LocalName.ToLowerInvariant();
            if (localName == "sitemapindex")
            {
                nested.AddRange(root.Descendants().Where(e => e.Name.LocalName.Equals("loc", StringComparison.OrdinalIgnoreCase))
                    .Select(e => e.Value.Trim())
                    .Where(v => !string.IsNullOrEmpty(v)));
            }
            else if (localName == "urlset")
            {
                foreach (var urlEl in root.Elements().Where(e => e.Name.LocalName.Equals("url", StringComparison.OrdinalIgnoreCase)))
                {
                    var loc = urlEl.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("loc", StringComparison.OrdinalIgnoreCase))?.Value.Trim();
                    if (!string.IsNullOrEmpty(loc))
                    {
                        pages.Add(NormalizeLink(origin, loc));
                    }
                }
            }
        }
        catch (System.Xml.XmlException)
        {
            // invalid xml
        }

        return (pages, nested);
    }

    private static string NormalizeLink(string baseUrl, string href)
    {
        if (Uri.TryCreate(href, UriKind.Absolute, out var absolute))
        {
            return absolute.ToString();
        }

        if (Uri.TryCreate(new Uri(baseUrl), href, out var combined))
        {
            return combined.ToString();
        }

        return href.Trim();
    }

    private static bool SameOrigin(string url, string origin) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && Uri.TryCreate(origin, UriKind.Absolute, out var originUri)
        && string.Equals(uri.Host, originUri.Host, StringComparison.OrdinalIgnoreCase);
}
