using System.Text;

namespace AiService.Api.Application.Chat;

/// <summary>Unicode sanitization for chat messages (ports Python <c>text_sanitize.strip_surrogates</c>).</summary>
public static class ChatTextSanitize
{
    /// <summary>
    /// Drops lone (unpaired) UTF-16 surrogates while preserving valid surrogate pairs, so
    /// emoji and other non-BMP characters survive. Matches the Python original, which only
    /// strips surrogates that cannot encode to UTF-8.
    /// </summary>
    public static string StripSurrogates(string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return "";
        }

        var sb = new StringBuilder(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (char.IsHighSurrogate(ch) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
            {
                // Valid surrogate pair — keep both halves.
                sb.Append(ch);
                sb.Append(text[i + 1]);
                i++;
            }
            else if (char.IsSurrogate(ch))
            {
                // Lone surrogate — drop (invalid in UTF-8).
            }
            else
            {
                sb.Append(ch);
            }
        }

        return sb.Length == text.Length ? text : sb.ToString();
    }
}
