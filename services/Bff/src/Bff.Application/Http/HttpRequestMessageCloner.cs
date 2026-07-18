using System.Net;

namespace Bff.Application.Http;

internal static class HttpRequestMessageCloner
{
    public static HttpRequestMessage Clone(HttpRequestMessage request)
    {
        var clone = new HttpRequestMessage(request.Method, request.RequestUri);
        foreach (var header in request.Headers)
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        if (request.Content is not null)
        {
            clone.Content = request.Content;
        }

        return clone;
    }
}
