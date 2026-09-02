using AiService.Api.Application.Chat;

namespace AiService.Tests;

public sealed class StreamingNarrativeExtractorTests
{
    [Fact]
    public void Extracts_incremental_insights_as_json_streams()
    {
        var extractor = new StreamingNarrativeExtractor();
        ChatNarrative? last = null;

        foreach (var chunk in new[]
                 {
                     "{\"power_insights\": [\"First insight",
                     "\", \"Second insight\"], \"recommended_actions\": []}",
                 })
        {
            extractor.Append(chunk);
            last = extractor.TryExtractPartial() ?? last;
        }

        Assert.NotNull(last);
        Assert.Equal(2, last.PowerInsights.Count);
        Assert.Equal("First insight", last.PowerInsights[0]);
        Assert.Equal("Second insight", last.PowerInsights[1]);
    }

    [Fact]
    public void Does_not_re_emit_unchanged_partial()
    {
        var extractor = new StreamingNarrativeExtractor();
        extractor.Append("{\"power_insights\": [\"Only one\"]}");
        Assert.NotNull(extractor.TryExtractPartial());
        Assert.Null(extractor.TryExtractPartial());
    }

    [Fact]
    public void Extracts_actions_after_insights_complete()
    {
        var extractor = new StreamingNarrativeExtractor();
        extractor.Append("{\"power_insights\": [\"Insight\"], \"recommended_actions\": [\"Action");
        Assert.NotNull(extractor.TryExtractPartial());
        extractor.Append(" one\"]}");
        var partial = extractor.TryExtractPartial();
        Assert.NotNull(partial);
        Assert.Single(partial.RecommendedActions);
        Assert.Equal("Action one", partial.RecommendedActions[0]);
    }
}
