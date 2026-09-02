using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Api.Application.Chat;
using AiService.Api.Domain;
using AiService.Api.Domain.Entities;

namespace AiService.Api.Controllers;

internal static class ChatHelpers
{
    private static readonly Regex FirstSentenceRe = new(@"^(.{8,80}[.!?])", RegexOptions.Singleline);

    internal static object FormatSession(ChatSession session) => new
    {
        id = session.Id,
        propertyId = session.PropertyId,
        title = session.Title,
        createdAt = session.CreatedAt,
        updatedAt = session.UpdatedAt,
    };

    internal static List<object> FormatMessages(IReadOnlyList<ChatMessage> rows)
    {
        var outList = new List<object>(rows.Count);
        foreach (var row in rows)
        {
            object? toolArgs = ParseJsonField(row.ToolArgs);
            object? toolResult = ParseJsonField(row.ToolResult);
            outList.Add(new
            {
                id = row.Id,
                role = row.Role,
                content = row.Content ?? "",
                tool_name = row.ToolName,
                tool_args = toolArgs,
                tool_result = toolResult,
                created_at = row.CreatedAt,
            });
        }

        return outList;
    }

    internal static List<ChatMessageRecord> MessagesForAgentContext(
        IReadOnlyList<ChatMessage> rows,
        int maxTurns = 20)
    {
        var relevant = rows.Where(m => m.Role is ChatRoles.User or ChatRoles.Assistant).ToList();
        var sliced = relevant.TakeLast(maxTurns * 2);
        return sliced.Select(m => new ChatMessageRecord(m.Role, m.Content ?? "")).ToList();
    }

    internal static string? DeriveTitle(string text)
    {
        text = text.Trim();
        if (string.IsNullOrEmpty(text))
        {
            return null;
        }

        var match = FirstSentenceRe.Match(text);
        var raw = match.Success ? match.Groups[1].Value.Trim() : text[..Math.Min(text.Length, 60)].Trim();
        return string.IsNullOrEmpty(raw) ? null : raw[..Math.Min(raw.Length, 80)];
    }

    internal static string SerializeNarrative(JsonObject narrative)
        => narrative.ToJsonString(new JsonSerializerOptions { WriteIndented = false });

    private static object? ParseJsonField(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            return JsonNode.Parse(raw);
        }
        catch (JsonException)
        {
            return raw;
        }
    }
}

internal static class SecretHelpers
{
    internal const string Mask = "*";

    internal static bool IsSecretKey(string key)
    {
        var keyLower = key.ToLowerInvariant();
        return keyLower.EndsWith("_secret", StringComparison.Ordinal)
               || keyLower.EndsWith("_api_key", StringComparison.Ordinal)
               || keyLower.EndsWith("_key", StringComparison.Ordinal)
               || keyLower.Contains("api_key", StringComparison.Ordinal)
               || keyLower.Contains("secret", StringComparison.Ordinal)
               || keyLower.Contains("password", StringComparison.Ordinal)
               || keyLower.Contains("token", StringComparison.Ordinal);
    }

    internal static bool IsMaskedSentinel(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();
        if (trimmed is Mask or "••••")
        {
            return true;
        }

        return trimmed.StartsWith('*') && trimmed.Length <= 4;
    }
}
