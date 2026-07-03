using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Tools.Context;
using AiService.Tools.Persistence;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Geo;

/// <summary>
/// Research-backed citability score (0-100) for GEO/AEO — ports Python <c>geo/geo_citability.py</c>.
/// Based on KDD 2024 (Princeton GEO paper) and AutoGEO ICLR 2026 findings; detects high-impact
/// methods from crawl text without external API calls.
/// </summary>
public static partial class GeoCitabilityToolHandlers
{
    [GeneratedRegex(@"\b\d[\d,]*\.?\d*\s*(?:%|percent|million|billion|thousand|k\b)", RegexOptions.IgnoreCase)]
    private static partial Regex StatPattern();

    [GeneratedRegex(
        "(?:according to|cited by|source:|as reported by|per [A-Z][a-z]+" +
        "|\"[^\"]{10,}\"|" +
        @"\[[\d,]+\]" +
        ")",
        RegexOptions.IgnoreCase)]
    private static partial Regex CitationPattern();

    [GeneratedRegex(
        @"https?://(?:www\.)?" +
        @"(?:wikipedia\.org|wikidata\.org|scholar\.google|ncbi\.nlm\.nih\.gov" +
        @"|arxiv\.org|pubmed\.ncbi|gov\.|edu\.|bbc\.com|reuters\.com" +
        @"|apnews\.com|nytimes\.com|washingtonpost\.com|theguardian\.com" +
        @"|nature\.com|sciencedirect\.com)",
        RegexOptions.IgnoreCase)]
    private static partial Regex AuthoritativeDomainsPattern();

    [GeneratedRegex(@"(?:^|\n)\s*(?:what|how|why|when|where|who|which|can|does|is|are)[^\n?]*\?", RegexOptions.IgnoreCase | RegexOptions.Multiline)]
    private static partial Regex QuestionPattern();

    [GeneratedRegex(@"<table|<tr|<th|<td|\|\s*[-:]+\s*\|", RegexOptions.IgnoreCase)]
    private static partial Regex TablePattern();

    [GeneratedRegex(@"^[^.!?\n]{10,200}(?:is|are|means|allows|enables|provides|helps|gives)[^.!?\n]{5,}[.!?]", RegexOptions.IgnoreCase)]
    private static partial Regex FrontLoadPattern();

    [GeneratedRegex(@"\b(is|are|means|refers to|defined as)\b", RegexOptions.IgnoreCase)]
    private static partial Regex DefinitionPattern();

    private static JsonObject CitabilitySignals(JsonObject rec)
    {
        var excerpt = JsonCoercion.AsString(rec["content_excerpt"]) ?? "";
        var html = JsonCoercion.AsString(rec["html"]) ?? "";
        var wc = JsonCoercion.AsInt(rec["word_count"]) ?? 0;
        var words = excerpt.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var lead = string.Join(" ", words.Take(120));
        var excerptWc = words.Length;

        var quoteMatches = CitationPattern().Matches(excerpt).Count;
        var authoritativeLinks = AuthoritativeDomainsPattern().Matches(html).Count;
        var citationScore = Math.Min(20, (quoteMatches * 4) + (authoritativeLinks * 5));

        var statMatches = StatPattern().Matches(excerpt).Count;
        var statsScore = Math.Min(15, statMatches * 3);

        var fkGrade = excerptWc > 30 ? ReadingLevel.FleschKincaidGrade(words, excerpt) : 0.0;
        int fluencyScore;
        if (fkGrade is >= 7 and <= 13)
        {
            fluencyScore = 10;
        }
        else if (fkGrade is >= 5 and <= 15)
        {
            fluencyScore = 6;
        }
        else if (wc > 50)
        {
            fluencyScore = 3;
        }
        else
        {
            fluencyScore = 0;
        }

        var leadTrimmed = lead.Trim();
        var hasFrontLoad = FrontLoadPattern().IsMatch(leadTrimmed);
        var hasDefinition = DefinitionPattern().IsMatch(lead.Length > 400 ? lead[..400] : lead);
        var frontLoadScore = hasFrontLoad ? 10 : hasDefinition ? 6 : 0;

        var hasUlOl = html.ToLowerInvariant().Contains("<li>") || Regex.IsMatch(excerpt, @"^\s*[-*•]\s", RegexOptions.Multiline);
        var hasTable = TablePattern().IsMatch(html);
        var listScore = Math.Min(10, (hasUlOl ? 8 : 0) + (hasTable ? 6 : 0));

        var schemaTypes = CrawlSliceHelpers.RowSchemaTypesList(rec).Select(t => t.ToLowerInvariant()).ToList();
        var hasFaqSchema = schemaTypes.Any(t => t is "faqpage" or "qapage" or "question" || t.Contains("faq"));
        var hasQuestions = QuestionPattern().IsMatch(excerpt);
        var faqScore = hasFaqSchema ? 8 : hasQuestions ? 4 : 0;

        var headingSeq = (JsonCoercion.AsString(rec["heading_sequence"]) ?? "").ToLowerInvariant();
        var hasH1H2 = headingSeq.Contains("h1") && headingSeq.Contains("h2");
        var headingScore = hasH1H2 ? 5 : 0;

        var entityCount = rec["top_keywords"] switch
        {
            JsonArray arr => arr.Count,
            JsonValue v when JsonCoercion.AsString(v) is not null => 1,
            _ => 0,
        };
        var entityScore = Math.Min(4, entityCount);

        var depthScore = wc >= 600 ? 3 : wc >= 300 ? 2 : wc >= 150 ? 1 : 0;

        var total = Math.Min(100, citationScore + statsScore + fluencyScore + frontLoadScore + listScore + faqScore + headingScore + entityScore + depthScore);

        return new JsonObject
        {
            ["citability_score"] = total,
            ["signals"] = new JsonObject
            {
                ["citations_quotes"] = citationScore,
                ["statistics_numbers"] = statsScore,
                ["fluency"] = fluencyScore,
                ["front_loading_definition"] = frontLoadScore,
                ["lists_tables"] = listScore,
                ["faq_qa_schema"] = faqScore,
                ["heading_hierarchy"] = headingScore,
                ["entity_richness"] = entityScore,
                ["content_depth"] = depthScore,
            },
            ["word_count"] = wc,
            ["flesch_kincaid_grade"] = fkGrade,
            ["has_faq_schema"] = hasFaqSchema,
            ["has_lists"] = hasUlOl,
            ["has_table"] = hasTable,
            ["authoritative_links"] = authoritativeLinks,
            ["stat_count"] = statMatches,
            ["citation_matches"] = quoteMatches,
        };
    }

    private static bool IsSuccessStatus(JsonObject rec) => (JsonCoercion.AsString(rec["status"]) ?? "").StartsWith('2');

    public static async Task<JsonObject> GetCitabilityScoreAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["citability_score"] = 0, ["total_pages"] = 0, ["provenance"] = "Estimated", ["missing"] = true };
        }

        var scores = new List<double>();
        var signalTotals = new Dictionary<string, double>();
        foreach (var rec in rows.Where(IsSuccessStatus))
        {
            var result = CitabilitySignals(rec);
            scores.Add(JsonCoercion.Num(result["citability_score"]));
            foreach (var (key, value) in result["signals"] as JsonObject ?? [])
            {
                signalTotals[key] = signalTotals.GetValueOrDefault(key) + JsonCoercion.Num(value);
            }
        }

        if (scores.Count == 0)
        {
            return new JsonObject { ["citability_score"] = 0, ["total_pages"] = 0, ["provenance"] = "Estimated" };
        }

        var avg = Math.Round(scores.Average(), 1);
        var n = scores.Count;
        var avgSignals = new JsonObject();
        foreach (var (key, value) in signalTotals)
        {
            avgSignals[key] = Math.Round(value / n, 2);
        }

        return new JsonObject
        {
            ["citability_score"] = avg,
            ["total_pages"] = n,
            ["pages_above_50"] = scores.Count(s => s >= 50),
            ["pages_above_75"] = scores.Count(s => s >= 75),
            ["average_signals"] = avgSignals,
            ["provenance"] = "Estimated",
        };
    }

    public static async Task<JsonObject> GetCitabilityForUrlAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var url = (JsonCoercion.AsString(args["url"]) ?? "").Trim();
        if (url.Length == 0)
        {
            return new JsonObject { ["error"] = "url is required" };
        }

        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["error"] = "no crawl data", ["url"] = url };
        }

        var needle = url.ToLowerInvariant();
        var rec = rows.FirstOrDefault(r => (JsonCoercion.AsString(r["url"]) ?? "").ToLowerInvariant() == needle);
        if (rec is null)
        {
            return new JsonObject { ["error"] = "url not found in crawl", ["url"] = url };
        }

        var result = CitabilitySignals(rec);
        result["url"] = JsonCoercion.AsString(rec["url"]) ?? "";
        result["title"] = JsonCoercion.AsString(rec["title"]) ?? "";
        result["provenance"] = "Estimated";
        return result;
    }
}
