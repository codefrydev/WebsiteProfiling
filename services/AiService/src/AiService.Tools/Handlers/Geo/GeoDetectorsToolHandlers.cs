using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Tools.Context;
using AiService.Tools.Persistence;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Geo;

/// <summary>
/// Advanced GEO/AEO detectors — ports Python <c>geo/geo_detectors.py</c>: negative signals, prompt
/// injection, RAG chunk readiness, content decay, multimodal readiness, and topic authority clustering.
/// </summary>
public static partial class GeoDetectorsToolHandlers
{
    [GeneratedRegex(@"\b(?:buy now|sign up|get started|subscribe|click here|download now|free trial)\b", RegexOptions.IgnoreCase)]
    private static partial Regex CtaPattern();

    [GeneratedRegex(@"class=[""'][^""']*(?:popup|modal|overlay|lightbox)[^""']*[""']", RegexOptions.IgnoreCase)]
    private static partial Regex PopupPattern();

    [GeneratedRegex(@"(?:itemprop=[""']author[""']|class=[""'][^""']*author[^""']*[""']|<author)", RegexOptions.IgnoreCase)]
    private static partial Regex AuthorPattern();

    [GeneratedRegex(@"<h[1-6]", RegexOptions.IgnoreCase)]
    private static partial Regex HeadingPattern();

    [GeneratedRegex(@"(?:affiliate|partner|ref=|aff_id=|click_id=)", RegexOptions.IgnoreCase)]
    private static partial Regex AffiliatePattern();

    [GeneratedRegex(@"\b(?:home|about|contact|privacy policy|terms of service|cookie policy|all rights reserved)\b", RegexOptions.IgnoreCase)]
    private static partial Regex BoilerplatePattern();

    [GeneratedRegex(@"\b[a-z]{4,}\b")]
    private static partial Regex WordPattern();

    private static List<JsonObject> CheckNegativeSignalsForPage(JsonObject rec)
    {
        var html = JsonCoercion.AsString(rec["html"]) ?? "";
        var excerpt = JsonCoercion.AsString(rec["content_excerpt"]) ?? "";
        var wc = JsonCoercion.AsInt(rec["word_count"]) ?? 0;
        var url = JsonCoercion.AsString(rec["url"]) ?? "";
        var path = TryGetPath(url);
        var isHomepage = path is "/" or "";
        var signals = new List<JsonObject>();

        var ctaCount = CtaPattern().Matches(html).Count;
        if (ctaCount >= 4)
        {
            signals.Add(new JsonObject { ["signal"] = "cta_overload", ["detail"] = $"{ctaCount} CTA instances" });
        }

        if (wc < 150 && !isHomepage && wc > 0)
        {
            signals.Add(new JsonObject { ["signal"] = "thin_content", ["detail"] = $"{wc} words" });
        }

        var words = WordPattern().Matches(excerpt.ToLowerInvariant()).Select(m => m.Value).ToList();
        if (words.Count > 0)
        {
            var counts = words.GroupBy(w => w).OrderByDescending(g => g.Count()).First();
            if (counts.Count() >= 8 && counts.Count() / (double)words.Count > 0.05)
            {
                signals.Add(new JsonObject { ["signal"] = "keyword_stuffing", ["detail"] = $"'{counts.Key}' appears {counts.Count()}x" });
            }
        }

        if (PopupPattern().IsMatch(html))
        {
            signals.Add(new JsonObject { ["signal"] = "popup_overlay", ["detail"] = "Modal/popup class detected in HTML" });
        }

        var schemaTypes = CrawlSliceHelpers.RowSchemaTypesList(rec).Select(t => t.ToLowerInvariant()).ToList();
        var isArticle = schemaTypes.Any(t => t is "article" or "newsarticle" or "blogposting");
        var authorPresent = AuthorPattern().IsMatch(html);
        if (isArticle && !authorPresent)
        {
            signals.Add(new JsonObject { ["signal"] = "missing_author", ["detail"] = "Article schema without author attribution" });
        }

        var hasHeading = HeadingPattern().IsMatch(html);
        var hasList = html.ToLowerInvariant().Contains("<li>");
        if (wc >= 500 && !hasHeading && !hasList)
        {
            signals.Add(new JsonObject { ["signal"] = "no_structured_content", ["detail"] = $"{wc} words, no headings or lists" });
        }

        var affiliateCount = AffiliatePattern().Matches(html).Count;
        if (affiliateCount >= 6)
        {
            signals.Add(new JsonObject { ["signal"] = "affiliate_overload", ["detail"] = $"{affiliateCount} affiliate/tracking patterns" });
        }

        if (wc > 0 && wc < 400)
        {
            var boilerplateCount = BoilerplatePattern().Matches(excerpt).Count;
            if (boilerplateCount >= 4)
            {
                signals.Add(new JsonObject { ["signal"] = "boilerplate_ratio", ["detail"] = $"{boilerplateCount} boilerplate phrases on thin page" });
            }
        }

        return signals;
    }

    private static string TryGetPath(string url)
    {
        try
        {
            return new Uri(url, UriKind.RelativeOrAbsolute) is { IsAbsoluteUri: true } uri ? uri.AbsolutePath.ToLowerInvariant() : "";
        }
        catch (UriFormatException)
        {
            return "";
        }
    }

    private static bool IsSuccessStatus(JsonObject rec) => (JsonCoercion.AsString(rec["status"]) ?? "").StartsWith('2');

    public static async Task<JsonObject> GetNegativeSignalsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["pages"] = new JsonArray(), ["total"] = 0, ["provenance"] = "Estimated", ["missing"] = true };
        }

        var flagged = new List<(JsonObject Page, int Count)>();
        foreach (var rec in rows.Where(IsSuccessStatus))
        {
            var signals = CheckNegativeSignalsForPage(rec);
            if (signals.Count > 0)
            {
                flagged.Add((new JsonObject
                {
                    ["url"] = JsonCoercion.AsString(rec["url"]) ?? "",
                    ["title"] = JsonCoercion.AsString(rec["title"]) ?? "",
                    ["signals"] = new JsonArray(signals.Select(s => (JsonNode?)s).ToArray()),
                    ["signal_count"] = signals.Count,
                }, signals.Count));
            }
        }

        flagged = flagged.OrderByDescending(f => f.Count).ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(flagged.Select(f => (JsonNode?)f.Page).ToList(), limit, 50);

        var signalSummary = new JsonObject();
        foreach (var (page, _) in flagged)
        {
            foreach (var sig in page["signals"]!.AsArray())
            {
                var k = JsonCoercion.AsString(sig!["signal"])!;
                signalSummary[k] = (JsonCoercion.AsInt(signalSummary[k]) ?? 0) + 1;
            }
        }

        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["signal_summary"] = signalSummary,
            ["provenance"] = "Estimated",
        };
    }

    [GeneratedRegex(@"style=[""'][^""']*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)[^""']*[""']", RegexOptions.IgnoreCase)]
    private static partial Regex HiddenTextPattern();

    // Matches U+200B, U+200C, U+200D, U+00AD, U+FEFF, U+2060 (zero-width/invisible chars) —
    // verify with a hex dump before editing this line, the characters themselves aren't visible.
    [GeneratedRegex("[​‌‍­﻿⁠]")]
    private static partial Regex InvisibleUnicodePattern();

    [GeneratedRegex(@"(?:font-size\s*:\s*[01]px|font-size\s*:\s*0\.)", RegexOptions.IgnoreCase)]
    private static partial Regex MicroFontPattern();

    [GeneratedRegex(@"color\s*:\s*(?:#fff{3,6}|white|#000{3,6}|black)\s*;[^}]*background(?:-color)?\s*:\s*(?:#fff{3,6}|white|#000{3,6}|black)", RegexOptions.IgnoreCase)]
    private static partial Regex MonochromeTextPattern();

    [GeneratedRegex(@"<!--[^-]{50,}-->", RegexOptions.Singleline)]
    private static partial Regex HtmlCommentInjectionPattern();

    [GeneratedRegex(@"aria-hidden=[""']true[""'][^>]*>[^<]{30,}</\w+>", RegexOptions.IgnoreCase)]
    private static partial Regex AriaHiddenAbusePattern();

    [GeneratedRegex(@"data-(?:llm|ai|gpt|prompt)[^=]*=[""'][^""']{20,}[""']", RegexOptions.IgnoreCase)]
    private static partial Regex DataAttrInjectionPattern();

    [GeneratedRegex(
        @"(?:ignore (?:previous|prior|all) (?:instructions?|prompts?)|" +
        @"you are now|act as|roleplay as|pretend (?:you are|to be)|" +
        @"system prompt|disregard (?:your|the) (?:guidelines?|rules?|instructions?))",
        RegexOptions.IgnoreCase)]
    private static partial Regex LlmInstructionTextPattern();

    private static (string Name, Regex Pattern)[] InjectionPatterns() =>
    [
        ("hidden_text", HiddenTextPattern()),
        ("invisible_unicode", InvisibleUnicodePattern()),
        ("micro_font", MicroFontPattern()),
        ("monochrome_text", MonochromeTextPattern()),
        ("html_comment_injection", HtmlCommentInjectionPattern()),
        ("aria_hidden_abuse", AriaHiddenAbusePattern()),
        ("data_attr_injection", DataAttrInjectionPattern()),
        ("llm_instruction_text", LlmInstructionTextPattern()),
    ];

    public static async Task<JsonObject> DetectPromptInjectionAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["pages"] = new JsonArray(), ["total"] = 0, ["provenance"] = "Estimated", ["missing"] = true };
        }

        var flagged = new List<(JsonObject Page, int Count)>();
        foreach (var rec in rows.Where(IsSuccessStatus))
        {
            var html = JsonCoercion.AsString(rec["html"]) ?? "";
            if (html.Length == 0)
            {
                continue;
            }

            var found = new List<JsonObject>();
            foreach (var (name, pattern) in InjectionPatterns())
            {
                var match = pattern.Match(html);
                if (match.Success)
                {
                    var start = Math.Max(0, match.Index - 30);
                    var end = Math.Min(html.Length, match.Index + match.Length + 30);
                    var excerpt = html[start..end];
                    found.Add(new JsonObject { ["pattern"] = name, ["excerpt"] = excerpt.Length > 120 ? excerpt[..120] : excerpt });
                }
            }

            if (found.Count > 0)
            {
                flagged.Add((new JsonObject
                {
                    ["url"] = JsonCoercion.AsString(rec["url"]) ?? "",
                    ["title"] = JsonCoercion.AsString(rec["title"]) ?? "",
                    ["patterns"] = new JsonArray(found.Select(f => (JsonNode?)f).ToArray()),
                    ["pattern_count"] = found.Count,
                }, found.Count));
            }
        }

        flagged = flagged.OrderByDescending(f => f.Count).ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(flagged.Select(f => (JsonNode?)f.Page).ToList(), limit, 50);

        var patternSummary = new JsonObject();
        foreach (var (page, _) in flagged)
        {
            foreach (var p in page["patterns"]!.AsArray())
            {
                var k = JsonCoercion.AsString(p!["pattern"])!;
                patternSummary[k] = (JsonCoercion.AsInt(patternSummary[k]) ?? 0) + 1;
            }
        }

        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["pattern_summary"] = patternSummary,
            ["severity"] = flagged.Count > 0 ? "high" : "none",
            ["provenance"] = "Estimated",
        };
    }

    private const int MinSectionWords = 100;

    [GeneratedRegex(@"^[A-Z][^.!?]{20,120}(?:is|are|provides?|enables?|allows?|helps?|means?)[^.!?]{10,}[.!?]", RegexOptions.Multiline)]
    private static partial Regex AnchorSentencePattern();

    [GeneratedRegex(@"<h[2-4][^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex SectionBoundaryPattern();

    public static async Task<JsonObject> GetRagChunkReadinessAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["pages"] = new JsonArray(), ["total"] = 0, ["provenance"] = "Estimated", ["missing"] = true };
        }

        var results = new List<JsonObject>();
        foreach (var rec in rows.Where(IsSuccessStatus))
        {
            var excerpt = JsonCoercion.AsString(rec["content_excerpt"]) ?? "";
            var html = JsonCoercion.AsString(rec["html"]) ?? "";
            var headingSeq = (JsonCoercion.AsString(rec["heading_sequence"]) ?? "").ToLowerInvariant();
            var wc = JsonCoercion.AsInt(rec["word_count"]) ?? 0;
            var hasH2 = headingSeq.Contains("h2");
            var hasH3 = headingSeq.Contains("h3");
            var sectionBoundaries = SectionBoundaryPattern().Matches(html).Count;
            var approxSectionWc = sectionBoundaries > 0 ? wc / Math.Max(1, sectionBoundaries) : wc;
            var hasAnchorSentence = AnchorSentencePattern().IsMatch(excerpt);
            var ragScore = 0;
            if (wc >= 200)
            {
                ragScore += 20;
            }

            if (hasH2)
            {
                ragScore += 25;
            }

            if (sectionBoundaries >= 2)
            {
                ragScore += 20;
            }

            if (approxSectionWc is >= MinSectionWords and <= 600)
            {
                ragScore += 20;
            }

            if (hasAnchorSentence)
            {
                ragScore += 15;
            }

            results.Add(new JsonObject
            {
                ["url"] = JsonCoercion.AsString(rec["url"]) ?? "",
                ["title"] = JsonCoercion.AsString(rec["title"]) ?? "",
                ["rag_score"] = ragScore,
                ["word_count"] = wc,
                ["section_count"] = sectionBoundaries,
                ["approx_section_word_count"] = approxSectionWc,
                ["has_anchor_sentence"] = hasAnchorSentence,
                ["has_heading_boundaries"] = hasH2 || hasH3,
            });
        }

        results = results.OrderByDescending(r => JsonCoercion.AsInt(r["rag_score"])).ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(results.Cast<JsonNode?>().ToList(), limit, 50);
        var totalPages = results.Count;
        var avgRag = totalPages > 0 ? Math.Round(results.Sum(r => JsonCoercion.AsInt(r["rag_score"]) ?? 0) / (double)totalPages, 1) : 0;

        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["average_rag_score"] = avgRag,
            ["pages_above_60"] = results.Count(r => (JsonCoercion.AsInt(r["rag_score"]) ?? 0) >= 60),
            ["provenance"] = "Estimated",
        };
    }

    [GeneratedRegex(@"\b(?:in \d{4}|last year|this year|currently|as of \d{4}|recent(?:ly)?|now|today|latest)\b", RegexOptions.IgnoreCase)]
    private static partial Regex TemporalDecayPattern();

    [GeneratedRegex(@"\b\d[\d,]*\.?\d*\s*(?:%|percent|million|billion)\b", RegexOptions.IgnoreCase)]
    private static partial Regex StatDecayPattern();

    [GeneratedRegex(@"\bv(?:ersion)?\s*\d+\.\d+|\b\d{4}\s+version\b", RegexOptions.IgnoreCase)]
    private static partial Regex VersionDecayPattern();

    [GeneratedRegex(@"\b(?:conference|summit|launch|release|event)\s+\d{4}\b", RegexOptions.IgnoreCase)]
    private static partial Regex EventDecayPattern();

    [GeneratedRegex(@"\$\s*\d[\d,.]*|\b\d+\s*(?:dollars?|usd|eur|gbp)\b", RegexOptions.IgnoreCase)]
    private static partial Regex PriceDecayPattern();

    public static async Task<JsonObject> GetContentDecaySignalsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["pages"] = new JsonArray(), ["total"] = 0, ["provenance"] = "Estimated", ["missing"] = true };
        }

        var results = new List<JsonObject>();
        foreach (var rec in rows.Where(IsSuccessStatus))
        {
            var excerpt = JsonCoercion.AsString(rec["content_excerpt"]) ?? "";
            if (excerpt.Length == 0)
            {
                continue;
            }

            var temporal = TemporalDecayPattern().Matches(excerpt).Count;
            var stats = StatDecayPattern().Matches(excerpt).Count;
            var versions = VersionDecayPattern().Matches(excerpt).Count;
            var events = EventDecayPattern().Matches(excerpt).Count;
            var prices = PriceDecayPattern().Matches(excerpt).Count;
            var totalDecay = temporal + stats + versions + events + prices;
            var evergreenScore = Math.Max(0, 100 - (temporal * 5) - (stats * 2) - (versions * 8) - (events * 10) - (prices * 3));
            var decayTypes = new JsonArray();
            if (temporal > 0)
            {
                decayTypes.Add("temporal");
            }

            if (stats > 0)
            {
                decayTypes.Add("statistical");
            }

            if (versions > 0)
            {
                decayTypes.Add("version");
            }

            if (events > 0)
            {
                decayTypes.Add("event");
            }

            if (prices > 0)
            {
                decayTypes.Add("price");
            }

            results.Add(new JsonObject
            {
                ["url"] = JsonCoercion.AsString(rec["url"]) ?? "",
                ["title"] = JsonCoercion.AsString(rec["title"]) ?? "",
                ["evergreen_score"] = evergreenScore,
                ["decay_types"] = decayTypes,
                ["decay_signal_count"] = totalDecay,
                ["temporal_mentions"] = temporal,
                ["stat_mentions"] = stats,
                ["version_mentions"] = versions,
                ["event_mentions"] = events,
                ["price_mentions"] = prices,
            });
        }

        results = results.OrderBy(r => JsonCoercion.AsInt(r["evergreen_score"])).ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(results.Cast<JsonNode?>().ToList(), limit, 50);
        var totalPages = results.Count;
        var avgEv = totalPages > 0 ? Math.Round(results.Sum(r => JsonCoercion.AsInt(r["evergreen_score"]) ?? 0) / (double)totalPages, 1) : 0;

        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["average_evergreen_score"] = avgEv,
            ["pages_at_risk"] = results.Count(r => (JsonCoercion.AsInt(r["evergreen_score"]) ?? 0) < 60),
            ["provenance"] = "Estimated",
        };
    }

    [GeneratedRegex(@"<img[^>]+>", RegexOptions.IgnoreCase)]
    private static partial Regex ImgTagPattern();

    [GeneratedRegex(@"alt=[""'][^""']{3,}[""']", RegexOptions.IgnoreCase)]
    private static partial Regex AltTextPattern();

    [GeneratedRegex(@"(?:transcript|subtitle|caption|webvtt|\.srt\b)", RegexOptions.IgnoreCase)]
    private static partial Regex TranscriptPattern();

    public static async Task<JsonObject> GetMultimodalReadinessAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["pages"] = new JsonArray(), ["total"] = 0, ["provenance"] = "Estimated", ["missing"] = true };
        }

        var total = 0;
        var goodAlt = 0;
        var hasVideoSchema = 0;
        var hasAudioSchema = 0;
        var hasTranscript = 0;
        foreach (var rec in rows.Where(IsSuccessStatus))
        {
            total++;
            var html = JsonCoercion.AsString(rec["html"]) ?? "";
            var schemaTypes = CrawlSliceHelpers.RowSchemaTypesList(rec).Select(t => t.ToLowerInvariant()).ToList();
            var images = ImgTagPattern().Matches(html);
            var totalImgs = images.Count;
            var imgsWithAlt = images.Count(m => AltTextPattern().IsMatch(m.Value));
            if (totalImgs == 0 || imgsWithAlt / (double)totalImgs >= 0.8)
            {
                goodAlt++;
            }

            if (schemaTypes.Any(t => t is "videoobject" or "videogallery"))
            {
                hasVideoSchema++;
            }

            if (schemaTypes.Contains("audioobject"))
            {
                hasAudioSchema++;
            }

            if (TranscriptPattern().IsMatch(html))
            {
                hasTranscript++;
            }
        }

        var mmScore = total > 0
            ? Math.Round((goodAlt / (double)total * 40) + (hasVideoSchema / (double)total * 20) + (hasAudioSchema / (double)total * 10) + (hasTranscript / (double)total * 30), 1)
            : 0;

        return new JsonObject
        {
            ["multimodal_readiness_score"] = Math.Min(100, mmScore),
            ["total_pages"] = total,
            ["pages_with_good_alt_coverage"] = goodAlt,
            ["pages_with_video_schema"] = hasVideoSchema,
            ["pages_with_audio_schema"] = hasAudioSchema,
            ["pages_with_transcript_signals"] = hasTranscript,
            ["provenance"] = "Estimated",
        };
    }

    [GeneratedRegex("[a-z0-9]{4,}")]
    private static partial Regex TokenizePattern();

    private static List<string> SimpleTokenize(string text) => TokenizePattern().Matches(text.ToLowerInvariant()).Select(m => m.Value).ToList();

    private const int MaxClusterDocs = 200;

    public static async Task<JsonObject> GetTopicAuthorityAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["clusters"] = new JsonArray(), ["total_pages"] = 0, ["provenance"] = "Estimated", ["missing"] = true };
        }

        var docs = new List<(string Url, string Title, List<string> Tokens, int WordCount)>();
        foreach (var rec in rows.Where(IsSuccessStatus))
        {
            var url = JsonCoercion.AsString(rec["url"]) ?? "";
            var text = string.Join(" ", JsonCoercion.AsString(rec["title"]) ?? "", JsonCoercion.AsString(rec["h1"]) ?? "", JsonCoercion.AsString(rec["content_excerpt"]) ?? "");
            var tokens = SimpleTokenize(text);
            var wc = JsonCoercion.AsInt(rec["word_count"]) ?? 0;
            if (tokens.Count > 0)
            {
                docs.Add((url, JsonCoercion.AsString(rec["title"]) ?? "", tokens, wc));
            }
        }

        if (docs.Count < 2)
        {
            return new JsonObject { ["clusters"] = new JsonArray(), ["total_pages"] = docs.Count, ["provenance"] = "Estimated", ["note"] = "insufficient pages" };
        }

        if (docs.Count > MaxClusterDocs)
        {
            docs = docs.OrderByDescending(d => d.WordCount).Take(MaxClusterDocs).ToList();
        }

        var n = docs.Count;
        var docFreq = new Dictionary<string, int>();
        foreach (var d in docs)
        {
            foreach (var t in d.Tokens.Distinct())
            {
                docFreq[t] = docFreq.GetValueOrDefault(t) + 1;
            }
        }

        var idf = docFreq.ToDictionary(kvp => kvp.Key, kvp => Math.Log((1.0 + n) / (1.0 + kvp.Value)) + 1);

        Dictionary<string, double> TfidfVec(List<string> tokens)
        {
            var tf = tokens.GroupBy(t => t).ToDictionary(g => g.Key, g => g.Count());
            var total = tokens.Count == 0 ? 1 : tokens.Count;
            return tf.ToDictionary(kvp => kvp.Key, kvp => (kvp.Value / (double)total) * idf.GetValueOrDefault(kvp.Key, 1));
        }

        var vecs = docs.Select(d => TfidfVec(d.Tokens)).ToList();

        double Cosine(Dictionary<string, double> a, Dictionary<string, double> b)
        {
            var keys = a.Keys.Union(b.Keys);
            var dot = keys.Sum(t => a.GetValueOrDefault(t) * b.GetValueOrDefault(t));
            var na = Math.Sqrt(a.Values.Sum(v => v * v));
            var nb = Math.Sqrt(b.Values.Sum(v => v * v));
            na = na == 0 ? 1 : na;
            nb = nb == 0 ? 1 : nb;
            return dot / (na * nb);
        }

        var clusterId = Enumerable.Range(0, n).ToArray();
        var merged = true;
        const double threshold = 0.25;
        for (var iter = 0; iter < 3 && merged; iter++)
        {
            merged = false;
            for (var i = 0; i < n; i++)
            {
                var bestJ = -1;
                var bestSim = threshold;
                for (var j = 0; j < n; j++)
                {
                    if (i == j)
                    {
                        continue;
                    }

                    var sim = Cosine(vecs[i], vecs[j]);
                    if (sim > bestSim)
                    {
                        bestSim = sim;
                        bestJ = j;
                    }
                }

                if (bestJ >= 0 && clusterId[bestJ] != clusterId[i])
                {
                    var old = clusterId[i];
                    var newId = clusterId[bestJ];
                    for (var k = 0; k < n; k++)
                    {
                        if (clusterId[k] == old)
                        {
                            clusterId[k] = newId;
                        }
                    }

                    merged = true;
                }
            }
        }

        var groups = new Dictionary<int, List<int>>();
        for (var i = 0; i < n; i++)
        {
            if (!groups.TryGetValue(clusterId[i], out var list))
            {
                list = [];
                groups[clusterId[i]] = list;
            }

            list.Add(i);
        }

        var clusters = new List<JsonObject>();
        foreach (var (cid, members) in groups.OrderByDescending(g => g.Value.Count))
        {
            if (members.Count < 2)
            {
                continue;
            }

            var clusterDocs = members.Select(i => docs[i]).ToList();
            var allTokens = clusterDocs.SelectMany(d => d.Tokens).ToList();
            var topTerms = allTokens.GroupBy(t => t)
                .OrderByDescending(g => g.Count())
                .Take(5)
                .Select(g => g.Key)
                .Where(t => idf.GetValueOrDefault(t, 1) < 3.0)
                .ToList();
            var pillar = clusterDocs.OrderByDescending(d => d.WordCount).First();
            clusters.Add(new JsonObject
            {
                ["cluster_id"] = cid,
                ["page_count"] = members.Count,
                ["top_terms"] = new JsonArray(topTerms.Select(t => (JsonNode?)t).ToArray()),
                ["pillar_url"] = pillar.Url,
                ["pillar_title"] = pillar.Title,
                ["pages"] = new JsonArray(clusterDocs.Take(10).Select(d => (JsonNode?)new JsonObject { ["url"] = d.Url, ["title"] = d.Title }).ToArray()),
            });
        }

        var authorityScore = Math.Min(100, Math.Round((clusters.Count * 10) + (n / (double)Math.Max(1, clusters.Count) * 2)));
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 10, 20);
        var sliced = PayloadSliceHelpers.CapList(clusters.Cast<JsonNode?>().ToList(), limit, 20);

        return new JsonObject
        {
            ["clusters"] = sliced["items"]?.DeepClone(),
            ["total_clusters"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["total_pages"] = n,
            ["topic_authority_score"] = authorityScore,
            ["provenance"] = "Estimated",
        };
    }
}
