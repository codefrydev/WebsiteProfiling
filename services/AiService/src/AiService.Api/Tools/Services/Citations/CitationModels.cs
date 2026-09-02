using AiService.Api.Domain;

namespace AiService.Api.Tools.Services.Citations;

public sealed record CitationResult(
    string Query,
    string Brand,
    string Domain,
    string Provider,
    bool BrandMentioned,
    bool DomainCited,
    IReadOnlyList<string> Sources,
    IReadOnlyList<string> CompetitorsCited,
    string AnswerExcerpt);

public sealed record CitationCheckRequest(
    string Query,
    string Brand,
    string Domain,
    string Provider = LlmProviders.Perplexity,
    string? ApiKey = null);
