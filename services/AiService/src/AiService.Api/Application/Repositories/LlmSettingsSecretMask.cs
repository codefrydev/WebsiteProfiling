namespace AiService.Api.Application.Repositories;

public static class LlmSettingsSecretMask
{
    public const string Mask = "*";

    private static readonly HashSet<string> MaskSentinels = new(StringComparer.Ordinal) { Mask, "••••" };

    public static bool IsMaskedSentinel(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();
        if (MaskSentinels.Contains(trimmed))
        {
            return true;
        }

        return trimmed.StartsWith("*", StringComparison.Ordinal) && trimmed.Length <= 4;
    }

    public static string MaskApiKey(string apiKey)
        => string.IsNullOrEmpty(apiKey) ? "" : Mask;
}
