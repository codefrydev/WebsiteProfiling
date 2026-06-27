using System.Net.Http;
using System.Net.Sockets;
using AiService.Providers.Chat;

namespace AiService.Tests;

public sealed class LlmTransportFailuresTests
{
    [Fact]
    public void IsUnavailable_detects_connection_refused()
    {
        var ex = new HttpRequestException("Connection refused (127.0.0.1:11434)", new SocketException(61));
        Assert.True(LlmTransportFailures.IsUnavailable(ex));
    }

    [Fact]
    public void IsUnavailable_ignores_logic_errors()
    {
        Assert.False(LlmTransportFailures.IsUnavailable(new InvalidOperationException("bad json")));
    }
}
