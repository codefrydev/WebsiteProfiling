namespace AiService.Domain;

public static class LlmProviders
{
    public const string None = "none";
    public const string OpenAi = "openai";
    public const string Anthropic = "anthropic";
    public const string Groq = "groq";
    public const string Gemini = "gemini";
    public const string Ollama = "ollama";
    public const string Perplexity = "perplexity";

    public static readonly IReadOnlyList<string> CloudProviders = [OpenAi, Gemini, Anthropic, Groq];

    /// <summary>Provider -&gt; its API key env var name. Single source of truth (was duplicated
    /// across LlmConfigHelpers.cs and CitationCheckService.cs).</summary>
    public static readonly IReadOnlyDictionary<string, string> ApiKeyEnvVarByProvider =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [OpenAi] = "OPENAI_API_KEY",
            [Gemini] = "GEMINI_API_KEY",
            [Anthropic] = "ANTHROPIC_API_KEY",
            [Groq] = "GROQ_API_KEY",
            [Perplexity] = "PERPLEXITY_API_KEY",
        };
}
