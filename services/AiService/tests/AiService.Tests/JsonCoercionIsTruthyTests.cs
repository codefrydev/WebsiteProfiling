using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tests;

public sealed class JsonCoercionIsTruthyTests
{
    [Theory]
    [InlineData("true", true)]
    [InlineData("1", true)]
    [InlineData("yes", true)]
    [InlineData("false", false)]
    [InlineData("0", false)]
    public void IsTruthy_string_values(string raw, bool expected)
    {
        Assert.Equal(expected, JsonCoercion.IsTruthy(JsonValue.Create(raw)));
    }

    [Fact]
    public void IsTruthy_boolean_and_number()
    {
        Assert.True(JsonCoercion.IsTruthy(JsonValue.Create(true)));
        Assert.False(JsonCoercion.IsTruthy(JsonValue.Create(false)));
        Assert.True(JsonCoercion.IsTruthy(JsonValue.Create(1)));
        Assert.False(JsonCoercion.IsTruthy(JsonValue.Create(0)));
    }
}
