using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Bff.Api.Infrastructure;

/// <summary>
/// Right-sized error normalization: upstream connection failures → 502, upstream timeouts → 504,
/// anything else → 500, all as ProblemDetails. 4xx/422 bodies from FastAPI are NOT remapped here —
/// the forwarder passes them through verbatim so the frontend's existing validation parsing keeps working.
/// </summary>
public sealed class UpstreamExceptionHandler(ILogger<UpstreamExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext context,
        Exception exception,
        CancellationToken cancellationToken)
    {
        // Once the response has started streaming we can't change the status — let it bubble.
        if (context.Response.HasStarted)
        {
            return false;
        }

        // Client disconnected: not our error to report.
        if (exception is OperationCanceledException && context.RequestAborted.IsCancellationRequested)
        {
            return false;
        }

        var (status, title) = exception switch
        {
            HttpRequestException => (StatusCodes.Status502BadGateway, "Upstream request failed"),
            TaskCanceledException or TimeoutException => (StatusCodes.Status504GatewayTimeout, "Upstream timed out"),
            _ => (StatusCodes.Status500InternalServerError, "Internal server error"),
        };

        logger.LogWarning(exception, "BFF upstream error ({Status}) for {Method} {Path}",
            status, context.Request.Method, context.Request.Path);

        context.Response.StatusCode = status;
        var problem = new ProblemDetails { Status = status, Title = title, Detail = exception.Message };
        await context.Response.WriteAsJsonAsync(problem, problem.GetType(), options: null,
            contentType: "application/problem+json", cancellationToken);
        return true;
    }
}
