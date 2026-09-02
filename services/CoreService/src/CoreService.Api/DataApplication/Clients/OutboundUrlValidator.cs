using System.Net;
using System.Net.Sockets;

namespace CoreService.Api.DataApplication.Clients;

internal static class OutboundUrlValidator
{
    public static bool IsAllowedFetchUrl(string? url, out string? reason)
    {
        reason = null;
        if (string.IsNullOrWhiteSpace(url))
        {
            reason = "empty url";
            return false;
        }

        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            reason = "invalid url";
            return false;
        }

        if (uri.Scheme is not "http" and not "https")
        {
            reason = "unsupported scheme";
            return false;
        }

        if (string.IsNullOrWhiteSpace(uri.Host))
        {
            reason = "missing host";
            return false;
        }

        if (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || uri.Host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase))
        {
            reason = "localhost not allowed";
            return false;
        }

        if (IPAddress.TryParse(uri.Host, out var ip))
        {
            if (!IsPublicIp(ip))
            {
                reason = "private or link-local address not allowed";
                return false;
            }

            return true;
        }

        if (Uri.CheckHostName(uri.Host) == UriHostNameType.IPv6)
        {
            reason = "ipv6 literal not allowed";
            return false;
        }

        return true;
    }

    private static bool IsPublicIp(IPAddress ip)
    {
        if (IPAddress.IsLoopback(ip))
        {
            return false;
        }

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var bytes = ip.GetAddressBytes();
            if (bytes[0] == 10)
            {
                return false;
            }

            if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
            {
                return false;
            }

            if (bytes[0] == 192 && bytes[1] == 168)
            {
                return false;
            }

            if (bytes[0] == 127)
            {
                return false;
            }

            if (bytes[0] == 169 && bytes[1] == 254)
            {
                return false;
            }

            if (bytes[0] == 0)
            {
                return false;
            }
        }

        return true;
    }
}
