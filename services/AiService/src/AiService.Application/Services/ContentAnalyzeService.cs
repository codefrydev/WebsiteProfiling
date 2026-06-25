using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Application.Json;
using AiService.Application.Prompts;
using AiService.Application.Repositories;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;

namespace AiService.Application.Services;

public sealed class ContentAnalyzeService(
    ILlmConfigRepository configRepository,
    LlmCacheRepository cacheRepository,
    StructuredCompletionService completionService)
{
    public async Task<JsonObject> AnalyzeAsync(
        int? propertyId,
        string keyword,
        string bodyHtml,
        string titleTag = "",
        string metaDescription = "",
        string? landingUrl = null,
        bool useAi = false,
        bool refresh = false,
        string title = "",
        CancellationToken cancellationToken = default)
    {
        var score = ScoreDraft(keyword, bodyHtml, titleTag, metaDescription);
        var rule = RuleSuggestions(score);
        var result = new JsonObject
        {
            ["ok"] = true,
            ["score"] = score,
            ["suggestions"] = rule,
            ["summary"] = DefaultSummary(score, keyword),
            ["outline"] = new JsonArray(),
            ["title_ideas"] = new JsonArray(),
            ["ai_used"] = false,
            ["tools_used"] = new JsonArray(),
            ["tool_events"] = new JsonArray(),
            ["provenance"] = "Search Console + on-site heuristics",
        };

        if (!useAi)
        {
            result["provenance"] = $"{result["provenance"]?.GetValue<string>()} · Rule-based tips";
            return result;
        }

        var cfg = await configRepository.LoadAsync(cancellationToken);
        if (!LlmConfigHelpers.IsEnabled(cfg)
            || !LlmConfigHelpers.IsTruthy(cfg.GetValueOrDefault("llm_enable_content_studio") ?? "true"))
        {
            result["provenance"] = $"{result["provenance"]?.GetValue<string>()} · AI off (enable in Run audit → AI settings)";
            result["ai_error"] = "AI insights disabled in settings.";
            return result;
        }

        var model = (cfg.GetValueOrDefault("llm_model") ?? cfg.GetValueOrDefault("llm_provider") ?? "unknown").Trim();
        var bodyHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(bodyHtml ?? "")))[..16];
        var cachePayload = new JsonObject
        {
            ["keyword"] = keyword,
            ["title"] = title,
            ["title_tag"] = titleTag,
            ["meta_description"] = metaDescription,
            ["landing_url"] = landingUrl,
            ["grade_score"] = score["grade_score"]?.GetValue<int?>() ?? 0,
            ["body_hash"] = bodyHash,
        };
        var cacheKey = SHA256.HashData(
            Encoding.UTF8.GetBytes($"content_studio:v2-tools:{LlmPrompts.Version}:{model}:{cachePayload.ToJsonString()}"));
        var cacheKeyHex = Convert.ToHexStringLower(cacheKey);

        JsonObject? aiBlock = null;
        if (!refresh)
        {
            var cached = await cacheRepository.ReadObjectAsync(cacheKeyHex, cancellationToken);
            aiBlock = cached?["ai_block"] is JsonObject block ? JsonNodeCopy.CloneObject(block) : null;
        }

        if (aiBlock is null)
        {
            var userPayload = new JsonObject
            {
                ["keyword"] = keyword,
                ["title"] = title,
                ["title_tag"] = titleTag,
                ["meta_description"] = metaDescription,
                ["landing_url"] = landingUrl,
                ["score"] = JsonNodeCopy.CloneObject(score),
                ["body_excerpt"] = StripHtml(bodyHtml)[..Math.Min(StripHtml(bodyHtml).Length, 6000)],
            };

            try
            {
                aiBlock = await completionService.CompleteJsonAsync(
                    LlmPrompts.ContentStudioAnalyzeSystem,
                    userPayload.ToJsonString(),
                    cfg,
                    cancellationToken);

                if (aiBlock.Count > 0)
                {
                    await cacheRepository.WriteObjectAsync(
                        cacheKeyHex,
                        new JsonObject { ["ai_block"] = aiBlock.DeepClone(), ["tool_events"] = new JsonArray() },
                        cancellationToken);
                }
            }
            catch (Exception ex)
            {
                result["ai_error"] = ex.Message;
                result["provenance"] = $"{result["provenance"]?.GetValue<string>()} · Rule-based tips (AI failed)";
                return result;
            }
        }

        if (aiBlock is null || aiBlock.Count == 0)
        {
            result["ai_error"] = "No structured output from analyze agent.";
            result["provenance"] = $"{result["provenance"]?.GetValue<string>()} · Rule-based tips (AI failed)";
            return result;
        }

        aiBlock = JsonNodeCopy.CloneObject(aiBlock);

        var aiSuggestions = aiBlock["suggestions"] as JsonArray ?? [];
        foreach (var node in aiSuggestions)
        {
            if (node is JsonObject obj)
            {
                obj["source"] = "ai";
            }
        }

        result["suggestions"] = MergeSuggestions(rule, aiSuggestions);
        if (aiBlock["summary"] is not null)
        {
            result["summary"] = aiBlock["summary"]!.GetValue<string>();
        }

        if (aiBlock["outline"] is JsonArray outline)
        {
            var outLines = new JsonArray();
            foreach (var item in outline.Take(8))
            {
                outLines.Add(item?.GetValue<string>() ?? "");
            }

            result["outline"] = outLines;
        }

        if (aiBlock["title_ideas"] is JsonArray titles)
        {
            var outTitles = new JsonArray();
            foreach (var item in titles.Take(5))
            {
                outTitles.Add(item?.GetValue<string>() ?? "");
            }

            result["title_ideas"] = outTitles;
        }

        result["ai_used"] = true;
        result["provenance"] = "Tool-based AI analyze + Search Console heuristics";
        return result;
    }

    private static JsonObject ScoreDraft(string keyword, string bodyHtml, string titleTag, string metaDescription)
    {
        var plain = StripHtml(bodyHtml);
        var words = plain.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var wordCount = words.Length;
        var kw = (keyword ?? "").Trim();
        var kwCount = string.IsNullOrEmpty(kw)
            ? 0
            : Regex.Matches(plain, Regex.Escape(kw), RegexOptions.IgnoreCase).Count;

        var grade = wordCount >= 800 && kwCount >= 2 ? 75
            : wordCount >= 400 && kwCount >= 1 ? 60
            : 45;

        var terms = new JsonArray();
        if (!string.IsNullOrEmpty(kw))
        {
            terms.Add(new JsonObject
            {
                ["term"] = kw,
                ["status"] = kwCount >= 2 ? "included" : kwCount == 1 ? "partial" : "missing",
                ["importance"] = "high",
                ["count"] = kwCount,
                ["target"] = 2,
            });
        }

        var checks = new JsonArray();
        if (string.IsNullOrWhiteSpace(titleTag))
        {
            checks.Add(new JsonObject { ["pass"] = false, ["hint"] = "Add a title tag." });
        }

        if (string.IsNullOrWhiteSpace(metaDescription))
        {
            checks.Add(new JsonObject { ["pass"] = false, ["hint"] = "Add a meta description." });
        }

        return new JsonObject
        {
            ["grade_score"] = grade,
            ["grade_label"] = grade >= 75 ? "B" : grade >= 60 ? "C" : "D",
            ["word_count"] = wordCount,
            ["terms"] = terms,
            ["checks"] = checks,
            ["provenance"] = "Search Console + on-site heuristics",
        };
    }

    private static JsonArray RuleSuggestions(JsonObject score)
    {
        var items = new JsonArray();
        if (score["terms"] is JsonArray terms)
        {
            foreach (var node in terms)
            {
                if (node is not JsonObject term)
                {
                    continue;
                }

                var status = term["status"]?.GetValue<string>();
                var termText = term["term"]?.GetValue<string>() ?? "";
                if (status == "missing")
                {
                    items.Add(new JsonObject
                    {
                        ["text"] = $"Work the term “{termText}” into a heading or paragraph.",
                        ["priority"] = term["importance"]?.GetValue<string>() ?? "medium",
                        ["type"] = "term",
                        ["source"] = "rule",
                    });
                }
                else if (status == "partial")
                {
                    items.Add(new JsonObject
                    {
                        ["text"] = $"Use the full phrase “{termText}” (related words appear but not the exact query).",
                        ["priority"] = "medium",
                        ["type"] = "term",
                        ["source"] = "rule",
                    });
                }
            }
        }

        if (score["checks"] is JsonArray checks)
        {
            foreach (var node in checks)
            {
                if (node is JsonObject check && check["pass"]?.GetValue<bool?>() == false)
                {
                    items.Add(new JsonObject
                    {
                        ["text"] = check["hint"]?.GetValue<string>() ?? "Fix an on-page check.",
                        ["priority"] = "high",
                        ["type"] = "seo",
                        ["source"] = "rule",
                    });
                }
            }
        }

        var wordCount = score["word_count"]?.GetValue<int?>() ?? 0;
        if (wordCount is > 0 and < 400)
        {
            items.Add(new JsonObject
            {
                ["text"] = "Expand the body with examples, FAQs, or subsections to reach a competitive word count.",
                ["priority"] = "medium",
                ["type"] = "structure",
                ["source"] = "rule",
            });
        }

        return new JsonArray(items.Take(15).Select(x => x!.DeepClone()).ToArray());
    }

    private static JsonArray MergeSuggestions(JsonArray rule, JsonArray ai)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var merged = new JsonArray();
        foreach (var node in ai.Concat(rule))
        {
            if (node is not JsonObject item)
            {
                continue;
            }

            var text = Regex.Replace(item["text"]?.GetValue<string>() ?? "", @"\s+", " ").Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(text) || !seen.Add(text))
            {
                continue;
            }

            merged.Add(new JsonObject
            {
                ["text"] = item["text"]?.GetValue<string>() ?? "",
                ["priority"] = item["priority"]?.GetValue<string>() ?? "medium",
                ["type"] = item["type"]?.GetValue<string>() ?? "seo",
                ["source"] = item["source"]?.GetValue<string>() ?? "ai",
            });

            if (merged.Count >= 20)
            {
                break;
            }
        }

        return merged;
    }

    private static string DefaultSummary(JsonObject score, string keyword)
    {
        var grade = score["grade_label"]?.GetValue<string>() ?? "?";
        var pts = score["grade_score"]?.GetValue<int?>() ?? 0;
        var kw = string.IsNullOrWhiteSpace(keyword) ? "your target keyword" : keyword.Trim();
        var missing = 0;
        if (score["terms"] is JsonArray terms)
        {
            missing = terms.Count(x => x is JsonObject o && o["status"]?.GetValue<string>() == "missing");
        }

        return $"Draft scores {grade} ({pts}/100) for “{kw}”. {missing} priority term(s) still missing from the body.";
    }

    private static string StripHtml(string html)
        => Regex.Replace(html ?? "", "<[^>]+>", " ");
}
