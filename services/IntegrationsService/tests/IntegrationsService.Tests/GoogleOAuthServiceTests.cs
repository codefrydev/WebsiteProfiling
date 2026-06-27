using IntegrationsService.Application.Google;

namespace IntegrationsService.Tests;

public sealed class GoogleOAuthServiceTests
{
    [Fact]
    public void SignState_and_VerifyState_round_trip()
    {
        var state = GoogleOAuthService.SignState(42, "/integrations");
        var payload = GoogleOAuthService.VerifyState(state);
        Assert.NotNull(payload);
        Assert.Equal(42, payload!["p"].GetInt64());
        Assert.Equal("/integrations", payload["r"].GetString());
    }

    [Fact]
    public void VerifyState_rejects_tampered_signature()
    {
        var state = GoogleOAuthService.SignState(1, "/");
        var tampered = state[..^4] + "dead";
        Assert.Null(GoogleOAuthService.VerifyState(tampered));
    }

    [Fact]
    public void SafeReturnPath_blocks_open_redirects()
    {
        Assert.Equal("/", GoogleOAuthService.SafeReturnPath("https://evil.example"));
        Assert.Equal("/settings", GoogleOAuthService.SafeReturnPath("/settings"));
    }
}
