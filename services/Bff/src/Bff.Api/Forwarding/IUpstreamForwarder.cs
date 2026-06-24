namespace Bff.Api.Forwarding;

/// <summary>
/// Generic reverse-proxy primitive: forwards the current request to a named upstream client
/// and streams the response back. Handles opaque JSON payloads, SSE, and binary exports
/// uniformly (the upstream Content-Type/Content-Disposition are preserved). Cookies are NOT
/// forwarded upstream — the BFF terminates auth.
/// </summary>
public interface IUpstreamForwarder
{
    Task ForwardAsync(
        HttpContext context,
        string clientName,
        string pathAndQuery,
        bool disableResponseBuffering,
        CancellationToken cancellationToken);
}
