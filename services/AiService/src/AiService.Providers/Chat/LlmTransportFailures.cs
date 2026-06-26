using System.Net.Http;
using System.Net.Sockets;

namespace AiService.Providers.Chat;

/// <summary>Detect transport-level LLM failures (daemon down, DNS, timeout) vs parse/logic errors.</summary>
public static class LlmTransportFailures
{
    public static bool IsUnavailable(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is HttpRequestException or SocketException or TaskCanceledException)
            {
                return true;
            }
        }

        return false;
    }

    public static string Describe(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is HttpRequestException { Message: { Length: > 0 } httpMessage })
            {
                return httpMessage;
            }

            if (current is SocketException { Message: { Length: > 0 } socketMessage })
            {
                return socketMessage;
            }
        }

        return exception.Message;
    }
}
