using System.Text;

namespace AiService.Application.Chat;

/// <summary>Extracts incremental narrative bullets from a streaming JSON buffer.</summary>
public sealed class StreamingNarrativeExtractor
{
    private readonly StringBuilder _buffer = new();
    private int _lastInsightCount;
    private int _lastActionCount;

    public void Append(string delta)
    {
        if (!string.IsNullOrEmpty(delta))
        {
            _buffer.Append(delta);
        }
    }

    /// <summary>Returns a partial narrative when new complete bullets appear; otherwise null.</summary>
    public ChatNarrative? TryExtractPartial()
    {
        var partial = ChatNarrativeParser.TryParsePartial(_buffer.ToString());
        if (partial is null)
        {
            return null;
        }

        var insightCount = partial.PowerInsights.Count;
        var actionCount = partial.RecommendedActions.Count;
        if (insightCount <= _lastInsightCount && actionCount <= _lastActionCount)
        {
            return null;
        }

        _lastInsightCount = insightCount;
        _lastActionCount = actionCount;
        return partial;
    }
}
