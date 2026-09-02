namespace AiService.Api.Application.Chat;

/// <summary>Post-SSE chat persistence guards (testable without HTTP/SSE wiring).</summary>
public static class ChatStreamPersistence
{
    public static bool ShouldPersistAfterStream(CancellationToken cancellationToken, CancellationToken requestAborted) =>
        !cancellationToken.IsCancellationRequested && !requestAborted.IsCancellationRequested;
}
