using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Api.Providers.Chat;
using WebsiteProfiling.Contracts.Chat;

namespace AiService.Api.Application.Chat;

/// <summary>Parse and validate chat narrative JSON from LLM output.</summary>
public static class ChatNarrativeParser
{
    public static JsonObject UnwrapNarrativeObject(JsonObject parsed)
    {
        if (parsed["power_insights"] is JsonArray || parsed["recommended_actions"] is JsonArray)
        {
            return parsed;
        }

        if (parsed["data"] is JsonObject data)
        {
            return data;
        }

        return parsed;
    }

    public static (ChatNarrative Narrative, List<string> Errors) ValidateNarrative(JsonObject raw)
    {
        var errors = new List<string>();
        LlmNarrativeResponse? typed = null;
        try
        {
            typed = JsonSerializer.Deserialize<LlmNarrativeResponse>(raw.ToJsonString());
        }
        catch (JsonException)
        {
            // fall through to manual normalization
        }

        var insights = typed?.PowerInsights?.Where(s => !string.IsNullOrWhiteSpace(s)).Take(5).ToList()
            ?? NormalizeStringList(raw["power_insights"], "power_insights", errors, partial: false);
        var actions = typed?.RecommendedActions?.Where(s => !string.IsNullOrWhiteSpace(s)).Take(5).ToList()
            ?? NormalizeStringList(raw["recommended_actions"], "recommended_actions", errors, partial: false);
        if (insights.Count == 0 && actions.Count == 0)
        {
            errors.Add("both power_insights and recommended_actions are empty after normalization");
        }

        return (new ChatNarrative(insights, actions), errors);
    }

    /// <summary>Lenient parse for streaming partial JSON — skips missing-key errors.</summary>
    public static ChatNarrative? TryParsePartial(string buffer)
    {
        if (string.IsNullOrWhiteSpace(buffer))
        {
            return null;
        }

        var insights = ExtractCompleteStrings(buffer, "power_insights");
        var actions = ExtractCompleteStrings(buffer, "recommended_actions");
        if (insights.Count > 0 || actions.Count > 0)
        {
            return new ChatNarrative(insights, actions);
        }

        var parsed = TryParsePartialObject(buffer);
        if (parsed is null)
        {
            return null;
        }

        var unwrapped = UnwrapNarrativeObject(parsed);
        insights = NormalizeStringList(unwrapped["power_insights"], "power_insights", [], partial: true);
        actions = NormalizeStringList(unwrapped["recommended_actions"], "recommended_actions", [], partial: true);
        if (insights.Count == 0 && actions.Count == 0)
        {
            return null;
        }

        return new ChatNarrative(insights, actions);
    }

    private static List<string> ExtractCompleteStrings(string buffer, string field)
    {
        var marker = $"\"{field}\"";
        var idx = buffer.IndexOf(marker, StringComparison.Ordinal);
        if (idx < 0)
        {
            return [];
        }

        var arrayStart = buffer.IndexOf('[', idx);
        if (arrayStart < 0)
        {
            return [];
        }

        var results = new List<string>();
        var i = arrayStart + 1;
        while (i < buffer.Length && results.Count < 5)
        {
            while (i < buffer.Length && (char.IsWhiteSpace(buffer[i]) || buffer[i] == ','))
            {
                i++;
            }

            if (i >= buffer.Length || buffer[i] == ']')
            {
                break;
            }

            if (buffer[i] != '"')
            {
                break;
            }

            i++;
            var sb = new StringBuilder();
            var closed = false;
            while (i < buffer.Length)
            {
                if (buffer[i] == '\\' && i + 1 < buffer.Length)
                {
                    sb.Append(buffer[i]);
                    sb.Append(buffer[i + 1]);
                    i += 2;
                    continue;
                }

                if (buffer[i] == '"')
                {
                    closed = true;
                    i++;
                    break;
                }

                sb.Append(buffer[i++]);
            }

            if (!closed)
            {
                break;
            }

            var text = sb.ToString().Trim();
            if (!string.IsNullOrEmpty(text))
            {
                results.Add(text);
            }
        }

        return results;
    }

    private static JsonObject? TryParsePartialObject(string buffer)
    {
        var trimmed = buffer.Trim();
        var direct = JsonResponseParser.Parse(trimmed);
        if (direct.Count > 0 && (direct["power_insights"] is JsonArray || direct["recommended_actions"] is JsonArray))
        {
            return direct;
        }

        foreach (var suffix in PartialJsonSuffixes)
        {
            try
            {
                var node = JsonNode.Parse(trimmed + suffix);
                if (node is JsonObject obj)
                {
                    return obj;
                }
            }
            catch (JsonException)
            {
                // try next suffix
            }
        }

        return null;
    }

    private static readonly string[] PartialJsonSuffixes =
    [
        "\"]}",
        "\"]}]}",
        "]}",
        "]}]}",
        "\"}",
        "}",
    ];

    private static List<string> NormalizeStringList(
        JsonNode? value,
        string field,
        List<string> errors,
        bool partial)
    {
        var outList = new List<string>();
        if (value is not JsonArray list)
        {
            if (!partial)
            {
                errors.Add($"missing key {field}");
            }

            return outList;
        }

        foreach (var item in list)
        {
            if (item is not JsonValue scalar || !scalar.TryGetValue<string>(out var raw))
            {
                continue;
            }

            var text = (raw ?? "").Trim();
            if (string.IsNullOrEmpty(text))
            {
                continue;
            }

            outList.Add(text);
            if (outList.Count >= 5)
            {
                break;
            }
        }

        return outList;
    }
}
