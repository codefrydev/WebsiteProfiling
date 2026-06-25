namespace AiService.Application.Chat;

/// <summary>Unicode sanitization for chat messages (ports Python <c>text_sanitize.strip_surrogates</c>).</summary>
public static class ChatTextSanitize
{
    public static string StripSurrogates(string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return "";
        }

        var buffer = new char[text.Length];
        var length = 0;
        foreach (var ch in text)
        {
            if (char.IsSurrogate(ch))
            {
                continue;
            }

            buffer[length++] = ch;
        }

        return length == text.Length ? text : new string(buffer, 0, length);
    }
}
