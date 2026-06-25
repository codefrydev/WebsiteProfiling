using System.Text.Json.Nodes;
using AiService.Application.Repositories;

namespace AiService.Tests;

public sealed class LlmConfigPutHelpersTests
{
    [Fact]
    public void ParsePutEntries_SkipsMaskedMetadataKeys()
    {
        var state = new JsonObject
        {
            ["llm_provider"] = "groq",
            ["llm_api_key_groq_masked"] = true,
            ["llm_enabled"] = true,
        };

        var entries = LlmConfigPutHelpers.ParsePutEntries(state);

        Assert.Equal("groq", entries["llm_provider"]);
        Assert.Equal("true", entries["llm_enabled"]);
        Assert.False(entries.ContainsKey("llm_api_key_groq_masked"));
    }

    [Fact]
    public void ParsePutEntries_CoercesBooleanValues()
    {
        var state = new JsonObject
        {
            ["llm_chat_allow_crawl"] = false,
        };

        var entries = LlmConfigPutHelpers.ParsePutEntries(state);

        Assert.Equal("false", entries["llm_chat_allow_crawl"]);
    }
}
