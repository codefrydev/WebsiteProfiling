using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AiService.Domain;
using AiService.Tools.Services.Citations;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

using AiService.Tools.Persistence;
namespace AiService.Tools.Handlers.Integrations;

public static class IntegrationToolHandlers
{
    public static async Task<JsonObject> CheckAiCitationsLiveAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CitationCheckService citationService,
        CancellationToken cancellationToken)
    {
        var optInRaw = JsonCoercion.AsString(args["opt_in"]) ?? JsonCoercion.AsString(args["optIn"]);
        var optIn = string.Equals(optInRaw, "true", StringComparison.OrdinalIgnoreCase)
            || optInRaw == "1"
            || args["opt_in"]?.GetValue<bool?>() == true
            || args["optIn"]?.GetValue<bool?>() == true;
        if (!optIn)
        {
            return new JsonObject
            {
                ["error"] = "opt_in required",
                ["note"] =
                    "Live AI citation checks query external APIs and may incur costs. Pass opt_in=true to proceed. " +
                    "Set PERPLEXITY_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY.",
                ["provenance"] = "None",
            };
        }

        var scoped = ctx.WithArgs(args);
        var brand = JsonCoercion.AsString(args["brand"])?.Trim() ?? "";
        var query = JsonCoercion.AsString(args["query"])?.Trim() ?? "";
        var domain = await scoped.ResolvePropertyDomainAsync(db, cancellationToken) ?? "";
        var provider = (JsonCoercion.AsString(args["provider"]) ?? LlmProviders.Perplexity).Trim().ToLowerInvariant();
        var apiKey = JsonCoercion.AsString(args["api_key"]) ?? JsonCoercion.AsString(args["apiKey"]);

        if (string.IsNullOrEmpty(brand) && string.IsNullOrEmpty(domain))
        {
            return new JsonObject { ["error"] = "brand or property domain is required" };
        }

        if (string.IsNullOrEmpty(query))
        {
            var brandName = !string.IsNullOrEmpty(brand) ? brand : domain;
            query = $"What is {brandName}? Can you tell me about their main products or services?";
        }

        var key = await citationService.ResolveApiKeyAsync(provider, apiKey, cancellationToken);
        if (string.IsNullOrEmpty(key))
        {
            return new JsonObject
            {
                ["error"] = $"No API key found for provider '{provider}'",
                ["note"] = $"Set {provider.ToUpperInvariant()}_API_KEY env var or pass api_key argument.",
                ["provenance"] = "None",
            };
        }

        var queries = new List<string> { query };
        var multi = JsonCoercion.AsString(args["multi_query"]) ?? JsonCoercion.AsString(args["multiQuery"]);
        if (!string.IsNullOrWhiteSpace(multi))
        {
            queries.Add(multi);
        }

        var results = new JsonArray();
        foreach (var q in queries)
        {
            try
            {
                var result = await citationService.CheckAsync(
                    new CitationCheckRequest(q, brand.Length > 0 ? brand : domain, domain, provider, key),
                    cancellationToken);
                results.Add(ToJson(result));
            }
            catch (Exception ex)
            {
                results.Add(new JsonObject
                {
                    ["query"] = q,
                    ["error"] = ex.Message,
                    ["provider"] = provider,
                });
            }
        }

        var overallBrand = results.Any(n => n?["brand_mentioned"]?.GetValue<bool?>() == true);
        var overallDomain = results.Any(n => n?["domain_cited"]?.GetValue<bool?>() == true);

        return new JsonObject
        {
            ["brand"] = brand.Length > 0 ? brand : domain,
            ["domain"] = domain,
            ["provider"] = provider,
            ["queries_run"] = results.Count,
            ["brand_mentioned"] = overallBrand,
            ["domain_cited"] = overallDomain,
            ["results"] = results,
            ["provenance"] = "Live",
        };
    }

    private static JsonObject ToJson(CitationResult result) => new()
    {
        ["query"] = result.Query,
        ["brand"] = result.Brand,
        ["domain"] = result.Domain,
        ["provider"] = result.Provider,
        ["brand_mentioned"] = result.BrandMentioned,
        ["domain_cited"] = result.DomainCited,
        ["sources"] = new JsonArray(result.Sources.Select(s => JsonValue.Create(s)).ToArray()),
        ["competitors_cited"] = new JsonArray(result.CompetitorsCited.Select(s => JsonValue.Create(s)).ToArray()),
        ["answer_excerpt"] = result.AnswerExcerpt,
    };
}
