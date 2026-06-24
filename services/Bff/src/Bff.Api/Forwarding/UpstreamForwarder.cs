using Microsoft.AspNetCore.Http.Features;

namespace Bff.Api.Forwarding;

public sealed class UpstreamForwarder(IHttpClientFactory factory) : IUpstreamForwarder
{
    public async Task ForwardAsync(
        HttpContext context,
        string clientName,
        string pathAndQuery,
        bool disableResponseBuffering,
        CancellationToken cancellationToken)
    {
        var client = factory.CreateClient(clientName);
        var target = new Uri(client.BaseAddress!, pathAndQuery);

        using var request = new HttpRequestMessage(new HttpMethod(context.Request.Method), target);

        if (HasBody(context.Request.Method))
        {
            request.Content = new StreamContent(context.Request.Body);
            if (!string.IsNullOrEmpty(context.Request.ContentType))
            {
                request.Content.Headers.TryAddWithoutValidation("Content-Type", context.Request.ContentType);
            }
        }

        // Forward a minimal allowlist of request headers (never Host/Cookie).
        foreach (var name in ForwardableRequestHeaders)
        {
            if (context.Request.Headers.TryGetValue(name, out var values))
            {
                request.Headers.TryAddWithoutValidation(name, values.ToArray());
            }
        }

        using var upstream = await client.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        context.Response.StatusCode = (int)upstream.StatusCode;

        if (upstream.Content.Headers.ContentType is not null)
        {
            context.Response.ContentType = upstream.Content.Headers.ContentType.ToString();
        }
        if (upstream.Content.Headers.TryGetValues("Content-Disposition", out var disposition))
        {
            context.Response.Headers["Content-Disposition"] = disposition.ToArray();
        }
        // Pass redirects through (e.g. the Google OAuth consent/callback 302s).
        if (upstream.Headers.Location is not null)
        {
            context.Response.Headers["Location"] = upstream.Headers.Location.ToString();
        }

        if (disableResponseBuffering)
        {
            context.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
        }

        await using var stream = await upstream.Content.ReadAsStreamAsync(cancellationToken);
        await stream.CopyToAsync(context.Response.Body, cancellationToken);
    }

    private static readonly string[] ForwardableRequestHeaders = ["Accept", "Accept-Language"];

    private static bool HasBody(string method) =>
        HttpMethods.IsPost(method)
        || HttpMethods.IsPut(method)
        || HttpMethods.IsPatch(method)
        || HttpMethods.IsDelete(method);
}
