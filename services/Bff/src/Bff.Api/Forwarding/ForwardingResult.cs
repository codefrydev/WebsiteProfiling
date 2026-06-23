namespace Bff.Api.Forwarding;

/// <summary>An IResult that forwards the current request to a named upstream.</summary>
public sealed class ForwardingResult(string clientName, string pathAndQuery, bool disableResponseBuffering) : IResult
{
    public Task ExecuteAsync(HttpContext httpContext)
    {
        var forwarder = httpContext.RequestServices.GetRequiredService<IUpstreamForwarder>();
        return forwarder.ForwardAsync(
            httpContext,
            clientName,
            pathAndQuery,
            disableResponseBuffering,
            httpContext.RequestAborted);
    }
}
