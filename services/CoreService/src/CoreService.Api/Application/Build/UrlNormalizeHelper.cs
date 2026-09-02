namespace CoreService.Api.Application.Build;

/// <summary>Port of Python integrations/google/normalize.py URL join keys.</summary>
public static class UrlNormalizeHelper
{
    public static string NormalizeUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return "";
        }

        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            return url.Trim().ToLowerInvariant();
        }

        var host = StripWww(uri.Host.ToLowerInvariant());
        var path = uri.AbsolutePath;
        if (string.IsNullOrEmpty(path))
        {
            path = "/";
        }

        return $"{host}{path}";
    }

    /// <summary>Map normalized URL key → canonical input URL (last wins, matching Python dict comprehension).</summary>
    public static Dictionary<string, string> ToNormalizedUrlMap(IEnumerable<string> urls)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var url in urls)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                continue;
            }

            var trimmed = url.Trim();
            map[NormalizeUrl(trimmed)] = trimmed;
        }

        return map;
    }

    public static string PathToUrl(string path, string startUrl)
    {
        if (!Uri.TryCreate(startUrl, UriKind.Absolute, out var start))
        {
            return path;
        }

        var origin = $"{start.Scheme}://{start.Authority}";
        return path.StartsWith('/') ? origin + path : origin + "/" + path;
    }

    private static string StripWww(string host) =>
        host.StartsWith("www.", StringComparison.Ordinal) ? host[4..] : host;
}
