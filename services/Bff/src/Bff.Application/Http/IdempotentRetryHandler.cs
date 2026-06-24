using System.Net;

namespace Bff.Application.Http;

/// <summary>
/// Minimal, dependency-free resilience: retries transient failures for idempotent
/// methods only (GET/HEAD) — never POST/PUT/PATCH/DELETE, so mutations can't double-submit.
/// This is the right-sized stand-in for a full Polly pipeline in a single-deployment app
/// (no circuit breaker by design). Attached only to the non-streaming FastAPI client.
/// </summary>
public sealed class IdempotentRetryHandler : DelegatingHandler
{
    private const int MaxRetries = 2;
    private static readonly TimeSpan BaseDelay = TimeSpan.FromMilliseconds(150);

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var idempotent = request.Method == HttpMethod.Get || request.Method == HttpMethod.Head;
        if (!idempotent)
        {
            return await base.SendAsync(request, cancellationToken);
        }

        for (var attempt = 0; ; attempt++)
        {
            try
            {
                var response = await base.SendAsync(request, cancellationToken);
                if (attempt >= MaxRetries || !IsTransient(response.StatusCode))
                {
                    return response;
                }
                response.Dispose();
            }
            catch (HttpRequestException) when (attempt < MaxRetries)
            {
                // fall through to retry
            }

            await Task.Delay(BaseDelay * (attempt + 1), cancellationToken);
        }
    }

    private static bool IsTransient(HttpStatusCode status) =>
        status == HttpStatusCode.RequestTimeout // 408
        || status == HttpStatusCode.BadGateway // 502
        || status == HttpStatusCode.ServiceUnavailable // 503
        || status == HttpStatusCode.GatewayTimeout; // 504
}
