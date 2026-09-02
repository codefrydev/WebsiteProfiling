using WebsiteProfiling.Contracts.Config;

namespace CoreService.Tests;

public sealed class TypedConfigValueCoercionTests
{
    [Theory]
    [InlineData("true", false, true)]
    [InlineData("True", false, true)]
    [InlineData("1", false, true)]
    [InlineData("yes", false, true)]
    [InlineData("false", false, false)]
    [InlineData("", false, false)]
    [InlineData(null, true, true)]
    public void ParseBool_parses_state_strings(string? raw, bool defaultValue, bool expected)
    {
        Assert.Equal(expected, TypedConfigValueCoercion.ParseBool(raw, defaultValue));
    }

    [Fact]
    public void Coerce_bool_writes_postgres_boolean_not_text()
    {
        var value = TypedConfigValueCoercion.Coerce("true", "bool", false);
        Assert.IsType<bool>(value);
        Assert.True((bool)value);
    }

    [Fact]
    public void Coerce_int_writes_postgres_integer_not_text()
    {
        var value = TypedConfigValueCoercion.Coerce("42", "int", 0);
        Assert.IsType<int>(value);
        Assert.Equal(42, (int)value);
    }

    [Fact]
    public void Coerce_text_passes_through_string()
    {
        var value = TypedConfigValueCoercion.Coerce("hello", "text", "");
        Assert.Equal("hello", value);
    }
}
