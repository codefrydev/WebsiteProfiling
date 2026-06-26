namespace ReportService.Application.Build;

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
        var path = uri.AbsolutePath.TrimEnd('/');
        if (string.IsNullOrEmpty(path))
        {
            path = "/";
        }

        return $"{host}{path}";
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
