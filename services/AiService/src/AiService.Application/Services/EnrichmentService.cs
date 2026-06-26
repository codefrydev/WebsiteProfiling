using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Application.Json;
using AiService.Application.Prompts;
using AiService.Application.Repositories;
using AiService.Domain.Models;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;

namespace AiService.Application.Services;

/// <summary>
/// LLM enrichment endpoints for <c>/internal/enrichment/*</c> — ports enrich.py, issue_fixes.py, audit_summary.py.
/// </summary>
public sealed class EnrichmentService(
    ILlmSettingsRepository configRepository,
    LlmCacheRepository cacheRepository,
    StructuredCompletionService completionService,
    FixSuggestionService fixSuggestionService)
{
    public async Task<JsonObject> ClusterKeywordsAsync(
        IReadOnlyList<string> keywords,
        CancellationToken cancellationToken = default)
    {
        var settings = await configRepository.LoadAsync(cancellationToken);
        if (keywords.Count < 2 || !LlmConfigHelpers.IsEnabled(settings) || !settings.EnableKeywordClusters)
        {
            return new JsonObject { ["clusters"] = new JsonArray() };
        }

        var kws = keywords.Take(200).ToList();
        var model = LlmConfigHelpers.DisplayModel(settings);
        var payload = new JsonObject { ["keywords"] = new JsonArray(kws.Select(x => JsonValue.Create(x)).ToArray()) };
        var cacheKey = LlmTaskCache.CacheKey("kw_clusters", model, payload);

        var cached = await cacheRepository.ReadObjectAsync(cacheKey, cancellationToken);
        JsonObject data;
        if (cached is not null)
        {
            data = cached;
        }
        else
        {
            data = await completionService.CompleteJsonAsync(
                LlmPrompts.KeywordClusterSystem,
                payload.ToJsonString(),
                settings,
                cancellationToken);
            await cacheRepository.WriteObjectAsync(cacheKey, data, cancellationToken);
        }

        var clusters = new JsonArray();
        if (data["clusters"] is JsonArray rawClusters)
        {
            foreach (var node in rawClusters)
            {
                if (node is not JsonObject c || c["keywords"] is not JsonArray words || words.Count < 2)
                {
                    continue;
                }

                var keywordList = words.Select(w => w?.GetValue<string>() ?? "").Where(w => !string.IsNullOrEmpty(w)).OrderBy(w => w).ToList();
                clusters.Add(new JsonObject
                {
                    ["top_keyword"] = c["top_keyword"]?.GetValue<string>() ?? keywordList[0],
                    ["keywords"] = new JsonArray(keywordList.Select(x => JsonValue.Create(x)).ToArray()),
                    ["cluster_score"] = Math.Round(c["cluster_score"]?.GetValue<double?>() ?? 0.9, 4),
                });
            }
        }

        var sorted = new JsonArray(clusters.OrderByDescending(x => x?["cluster_score"]?.GetValue<double?>() ?? 0).Select(x => x!.DeepClone()).ToArray());
        return new JsonObject { ["clusters"] = sorted };
    }

    public async Task<JsonObject> RunEnrichmentAsync(
        JsonArray pages,
        CancellationToken cancellationToken = default)
    {
        var settings = await configRepository.LoadAsync(cancellationToken);
        var bundle = new JsonObject
        {
            ["spacy_by_url"] = new JsonObject(),
            ["similar_internal_by_url"] = new JsonObject(),
            ["ner_site_summary"] = new JsonObject(),
            ["keyphrases_by_url"] = new JsonObject(),
            ["ml_errors"] = new JsonArray(),
        };

        if (pages.Count == 0 || !LlmConfigHelpers.IsEnabled(settings))
        {
            return bundle;
        }

        var maxPages = settings.MaxPages > 0 ? settings.MaxPages : 60;
        var items = BuildPageItems(pages, maxPages);
        if (items.Count == 0)
        {
            return bundle;
        }

        try
        {
            if (settings.EnableNer)
            {
                bundle["spacy_by_url"] = await RunBatchedTaskAsync("ner", LlmPrompts.NerSystem, items, settings, ApplyNerBatch, cancellationToken);
            }

            if (settings.EnableKeyphrases)
            {
                bundle["keyphrases_by_url"] = await RunBatchedTaskAsync(
                    "keyphrases",
                    LlmPrompts.KeyphrasesSystem,
                    items,
                    settings,
                    ApplyKeyphraseBatch,
                    cancellationToken);
            }

            if (settings.EnableSimilarInternal)
            {
                bundle["similar_internal_by_url"] = await RunSimilarInternalAsync(items, settings, cancellationToken);
            }

            bundle["ner_site_summary"] = AggregateNerSiteSummary(bundle["spacy_by_url"] as JsonObject ?? []);
            bundle["llm_meta"] = new JsonObject
            {
                ["model"] = LlmConfigHelpers.DisplayModel(settings),
                ["prompt_version"] = LlmPrompts.Version,
                ["generated_at"] = DateTimeOffset.UtcNow.ToString("O"),
            };
        }
        catch (Exception ex)
        {
            (bundle["ml_errors"] as JsonArray)?.Add(ex.Message);
        }

        return bundle;
    }

    public Task<JsonObject> GenerateIssueFixAsync(JsonObject issue, bool refresh = false, CancellationToken cancellationToken = default)
    {
        var payload = JsonNodeCopy.CloneObject(issue);
        payload["source"] = "issue";
        return fixSuggestionService.GenerateAsync(payload, refresh, cancellationToken);
    }

    public async Task<JsonObject> GenerateAuditSummaryAsync(
        JsonObject reportPayload,
        CancellationToken cancellationToken = default)
    {
        var settings = await configRepository.LoadAsync(cancellationToken);
        var categories = reportPayload["categories"] as JsonArray ?? [];
        var gsc = (reportPayload["google"] as JsonObject)?["gsc"] as JsonObject;
        var gscPages = gsc?["top_pages"] as JsonArray;
        var topIssues = RankIssuesByTraffic(categories, gscPages).Take(5).ToList();
        var avg = AverageCategoryScore(categories);

        var fallback = DeterministicSummaryText(avg, topIssues);
        var source = "deterministic";
        var priorities = new JsonArray();

        if (LlmConfigHelpers.IsEnabled(settings) && settings.EnableAuditSummary)
        {
            source = "ai_insights";
            var llmResult = await GenerateLlmExecutiveSummaryAsync(reportPayload, topIssues, settings, cancellationToken);
            var summary = llmResult["summary"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(summary))
            {
                fallback = summary!;
                if (llmResult["priorities"] is JsonArray p)
                {
                    priorities = p;
                }
            }
            else
            {
                fallback = DeterministicSummaryText(avg, topIssues, llmUnavailable: true);
            }
        }
        else if (LlmConfigHelpers.IsEnabled(settings))
        {
            fallback = DeterministicSummaryText(avg, topIssues, hintEnableLlm: true);
        }

        return new JsonObject
        {
            ["ok"] = true,
            ["source"] = source,
            ["summary"] = fallback,
            ["top_issues"] = new JsonArray(topIssues.Select(x => x.DeepClone()).ToArray()),
            ["priorities"] = priorities,
        };
    }

    private async Task<JsonObject> RunSimilarInternalAsync(
        IReadOnlyList<JsonObject> items,
        LlmSettings settings,
        CancellationToken cancellationToken)
    {
        var topK = Math.Min(settings.SimilarTopK > 0 ? settings.SimilarTopK : 5, 15);
        var allUrls = items.Select(x => x["url"]?.GetValue<string>() ?? "").Where(x => !string.IsNullOrEmpty(x)).ToList();
        var batchSize = Math.Max(1, Math.Min(settings.BatchSize > 0 ? settings.BatchSize : 5, 3));
        var batches = new List<JsonObject>();
        for (var i = 0; i < items.Count; i += batchSize)
        {
            var slice = items.Skip(i).Take(batchSize).ToList();
            batches.Add(new JsonObject
            {
                ["pages"] = new JsonArray(slice.Select(x => x.DeepClone()).ToArray()),
                ["candidate_urls"] = new JsonArray(allUrls.Take(80).Select(x => JsonValue.Create(x)).ToArray()),
                ["top_k"] = topK,
            });
        }

        var outObj = new JsonObject();
        foreach (var batch in batches)
        {
            var result = await RunSingleBatchAsync("similar", LlmPrompts.SimilarSystem, batch, settings, cancellationToken);
            if (result["pages"] is JsonArray pages)
            {
                foreach (var pageNode in pages)
                {
                    if (pageNode is not JsonObject page)
                    {
                        continue;
                    }

                    var url = (page["url"]?.GetValue<string>() ?? "").Trim().TrimEnd('/');
                    if (string.IsNullOrEmpty(url))
                    {
                        continue;
                    }

                    var sim = new JsonArray();
                    if (page["similar"] is JsonArray similar)
                    {
                        foreach (var s in similar.Take(topK))
                        {
                            if (s is JsonObject so && !string.IsNullOrEmpty(so["url"]?.GetValue<string>()))
                            {
                                sim.Add(new JsonObject
                                {
                                    ["url"] = so["url"]!.GetValue<string>(),
                                    ["score"] = Math.Round(so["score"]?.GetValue<double?>() ?? 0, 4),
                                });
                            }
                        }
                    }

                    if (sim.Count > 0)
                    {
                        outObj[url] = sim;
                    }
                }
            }
        }

        return outObj;
    }

    private async Task<JsonObject> RunBatchedTaskAsync(
        string task,
        string system,
        IReadOnlyList<JsonObject> items,
        LlmSettings settings,
        Action<JsonObject, JsonObject> applyBatch,
        CancellationToken cancellationToken)
    {
        var batchSize = Math.Max(1, settings.BatchSize > 0 ? settings.BatchSize : 5);
        var outObj = new JsonObject();
        for (var i = 0; i < items.Count; i += batchSize)
        {
            var batch = new JsonObject
            {
                ["pages"] = new JsonArray(items.Skip(i).Take(batchSize).Select(x => x.DeepClone()).ToArray()),
            };
            var result = await RunSingleBatchAsync(task, system, batch, settings, cancellationToken);
            applyBatch(outObj, result);
        }

        return outObj;
    }

    private async Task<JsonObject> RunSingleBatchAsync(
        string task,
        string system,
        JsonObject batch,
        LlmSettings settings,
        CancellationToken cancellationToken)
    {
        var model = LlmConfigHelpers.DisplayModel(settings);
        var cacheKey = LlmTaskCache.CacheKey(task, model, batch);
        var cached = await cacheRepository.ReadObjectAsync(cacheKey, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        var result = await completionService.CompleteJsonAsync(system, batch.ToJsonString(), settings, cancellationToken);
        await cacheRepository.WriteObjectAsync(cacheKey, result, cancellationToken);
        return result;
    }

    private static void ApplyNerBatch(JsonObject output, JsonObject data)
    {
        if (data["pages"] is not JsonArray pages)
        {
            return;
        }

        foreach (var pageNode in pages)
        {
            if (pageNode is not JsonObject page)
            {
                continue;
            }

            var url = (page["url"]?.GetValue<string>() ?? "").Trim().TrimEnd('/');
            if (string.IsNullOrEmpty(url))
            {
                continue;
            }

            output[url] = new JsonObject
            {
                ["entity_count"] = page["entity_count"]?.GetValue<int?>() ?? 0,
                ["top_entity_labels"] = page["top_entity_labels"]?.DeepClone() ?? new JsonArray(),
            };
        }
    }

    private static void ApplyKeyphraseBatch(JsonObject output, JsonObject data)
    {
        if (data["pages"] is not JsonArray pages)
        {
            return;
        }

        foreach (var pageNode in pages)
        {
            if (pageNode is not JsonObject page)
            {
                continue;
            }

            var url = (page["url"]?.GetValue<string>() ?? "").Trim().TrimEnd('/');
            if (string.IsNullOrEmpty(url))
            {
                continue;
            }

            var pairs = new JsonArray();
            if (page["phrases"] is JsonArray phrases)
            {
                foreach (var phraseNode in phrases)
                {
                    if (phraseNode is JsonArray pair && pair.Count >= 2)
                    {
                        pairs.Add(new JsonArray(pair[0]?.DeepClone(), JsonValue.Create(pair[1]?.GetValue<double?>() ?? 0)));
                    }
                }
            }

            output[url] = new JsonObject { ["phrases"] = pairs };
        }
    }

    private static List<JsonObject> BuildPageItems(JsonArray pages, int maxPages)
    {
        var items = new List<JsonObject>();
        foreach (var node in pages)
        {
            if (node is not JsonObject row)
            {
                continue;
            }

            var url = (row["url"]?.GetValue<string>() ?? "").Trim().TrimEnd('/');
            var text = (row["text"]?.GetValue<string>() ?? "").Trim();
            if (string.IsNullOrEmpty(url) || text.Length < 40)
            {
                continue;
            }

            items.Add(new JsonObject { ["url"] = url, ["text"] = text[..Math.Min(text.Length, 4000)] });
            if (items.Count >= maxPages)
            {
                break;
            }
        }

        return items;
    }

    private static JsonObject AggregateNerSiteSummary(JsonObject spacyByUrl)
    {
        var labelTotals = new Dictionary<string, int>(StringComparer.Ordinal);
        var totalEntities = 0;
        foreach (var prop in spacyByUrl)
        {
            if (prop.Value is not JsonObject info)
            {
                continue;
            }

            totalEntities += info["entity_count"]?.GetValue<int?>() ?? 0;
            if (info["top_entity_labels"] is JsonArray labels)
            {
                foreach (var labelNode in labels)
                {
                    if (labelNode is JsonArray pair && pair.Count >= 2)
                    {
                        var label = pair[0]?.GetValue<string>() ?? "";
                        var count = pair[1]?.GetValue<int?>() ?? 0;
                        labelTotals[label] = labelTotals.GetValueOrDefault(label) + count;
                    }
                }
            }
        }

        var labelCounts = new JsonObject();
        foreach (var (label, count) in labelTotals.OrderByDescending(x => x.Value).Take(40))
        {
            labelCounts[label] = count;
        }

        return new JsonObject
        {
            ["label_counts"] = labelCounts,
            ["pages_with_ner"] = spacyByUrl.Count,
            ["total_entities"] = totalEntities,
        };
    }

    private async Task<JsonObject> GenerateLlmExecutiveSummaryAsync(
        JsonObject reportPayload,
        IReadOnlyList<JsonObject> topIssues,
        LlmSettings settings,
        CancellationToken cancellationToken)
    {
        var categories = reportPayload["categories"] as JsonArray ?? [];
        var avg = AverageCategoryScore(categories);
        var payload = new JsonObject
        {
            ["health_score"] = avg,
            ["category_scores"] = new JsonArray(categories.Take(12).OfType<JsonObject>().Select(c => new JsonObject
            {
                ["name"] = c["name"]?.DeepClone(),
                ["score"] = c["score"]?.DeepClone(),
            }).ToArray()),
            ["top_issues"] = new JsonArray(topIssues.Select(i => new JsonObject
            {
                ["priority"] = i["priority"]?.DeepClone(),
                ["message"] = i["message"]?.DeepClone(),
                ["url"] = i["url"]?.DeepClone(),
                ["gsc_clicks"] = i["gsc_clicks"]?.DeepClone(),
            }).ToArray()),
            ["total_urls"] = (reportPayload["summary"] as JsonObject)?["total_urls"]?.DeepClone(),
        };

        try
        {
            var user = payload.ToJsonString()[..Math.Min(payload.ToJsonString().Length, 10_000)];
            return await completionService.CompleteJsonAsync(LlmPrompts.AuditExecutiveSystem, user, settings, cancellationToken);
        }
        catch (Exception)
        {
            return [];
        }
    }

    private static List<JsonObject> RankIssuesByTraffic(JsonArray categories, JsonArray? gscPages)
    {
        var clicksByUrl = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        if (gscPages is not null)
        {
            foreach (var rowNode in gscPages)
            {
                if (rowNode is not JsonObject row)
                {
                    continue;
                }

                var url = (row["page"]?.GetValue<string>() ?? "").Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(url))
                {
                    continue;
                }

                clicksByUrl[url] = row["clicks"]?.GetValue<double?>() ?? 0;
            }
        }

        var ranked = new List<JsonObject>();
        var priorityRank = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["Critical"] = 0,
            ["High"] = 1,
            ["Medium"] = 2,
            ["Low"] = 3,
        };

        foreach (var catNode in categories)
        {
            if (catNode is not JsonObject cat)
            {
                continue;
            }

            var catName = cat["name"]?.GetValue<string>() ?? cat["id"]?.GetValue<string>() ?? "";
            if (cat["issues"] is not JsonArray issues)
            {
                continue;
            }

            foreach (var issueNode in issues)
            {
                if (issueNode is not JsonObject issue)
                {
                    continue;
                }

                var url = (issue["url"]?.GetValue<string>() ?? "").Trim().ToLowerInvariant();
                var clicks = clicksByUrl.GetValueOrDefault(url);
                ranked.Add(new JsonObject
                {
                    ["message"] = issue["message"]?.DeepClone(),
                    ["url"] = issue["url"]?.DeepClone(),
                    ["priority"] = issue["priority"]?.DeepClone(),
                    ["category"] = catName,
                    ["gsc_clicks"] = clicks,
                    ["traffic_weight"] = clicks,
                });
            }
        }

        return ranked
            .OrderByDescending(x => x["traffic_weight"]?.GetValue<double?>() ?? 0)
            .ThenBy(x => priorityRank.GetValueOrDefault(x["priority"]?.GetValue<string>() ?? "Medium", 99))
            .ToList();
    }

    private static int? AverageCategoryScore(JsonArray categories)
    {
        var scores = categories.OfType<JsonObject>()
            .Select(c => c["score"]?.GetValue<double?>())
            .Where(s => s.HasValue)
            .Select(s => s!.Value)
            .ToList();
        if (scores.Count == 0)
        {
            return null;
        }

        return (int)Math.Round(scores.Average(), MidpointRounding.AwayFromZero);
    }

    private static string DeterministicSummaryText(
        int? avg,
        IReadOnlyList<JsonObject> topIssues,
        bool llmUnavailable = false,
        bool hintEnableLlm = false)
    {
        string msg;
        if (topIssues.Count > 0)
        {
            msg = "Prioritize fixes below by severity and Search Console traffic impact.";
        }
        else if (avg is >= 80)
        {
            msg = "Site health looks strong. Keep monitoring crawl and Search Console trends.";
        }
        else if (avg is not null)
        {
            msg = "Review category scores and address high-priority issues to improve overall health.";
        }
        else
        {
            msg = "No major issues detected in this audit run.";
        }

        if (llmUnavailable)
        {
            msg += " (AI summary unavailable — showing structured overview only.)";
        }
        else if (hintEnableLlm)
        {
            msg += " Enable audit executive summary in AI settings for an AI narrative.";
        }

        return msg;
    }

    private static int ParseInt(string? raw, int defaultValue)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return defaultValue;
        }

        return int.TryParse(raw.Trim(), out var value) ? value : defaultValue;
    }
}
